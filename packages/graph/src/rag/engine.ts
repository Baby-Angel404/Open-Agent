import { performance } from "node:perf_hooks";
import { VectorEngine } from "@open-agent/vector";
import {
  RAGQueryRequest,
  RAGResponse,
  RAGPassage,
  Entity,
  Relationship,
  Evidence,
  RAGConfig,
} from "../types/index.js";
import { IGraphStorage } from "../storage/graph-storage.js";
import { GraphTraversalEngine } from "../traversal/traversal.js";
import { IEntityExtractor } from "../extractors/base.js";
import { RuleBasedEntityExtractor } from "../extractors/rule-based.js";
import { GraphRanker, CandidateScoringInput } from "./ranker.js";
import { ContextAssembler } from "./assembler.js";
import { IAnswerGenerator, LocalDeterministicAnswerGenerator } from "./generator.js";

export const DEFAULT_RAG_CONFIG: RAGConfig = {
  use_dense: true,
  use_sparse: true,
  use_graph: true,
  graph_depth: 2,
  max_graph_nodes: 50,
  max_graph_edges: 100,
  top_k: 5,
  hybrid_weight: 0.5,
  graph_weight: 0.5,
  minimum_evidence_confidence: 0.7,
};

export interface GraphRAGEngineOptions {
  storage: IGraphStorage;
  vectorEngine?: VectorEngine;
  entityExtractor?: IEntityExtractor;
  ranker?: GraphRanker;
  assembler?: ContextAssembler;
  generator?: IAnswerGenerator;
  traversal?: GraphTraversalEngine;
  defaultConfig?: Partial<RAGConfig>;
}

export class GraphRAGEngine {
  private storage: IGraphStorage;
  private vectorEngine?: VectorEngine;
  private entityExtractor: IEntityExtractor;
  private ranker: GraphRanker;
  private assembler: ContextAssembler;
  private generator: IAnswerGenerator;
  private traversal: GraphTraversalEngine;
  private config: RAGConfig;

  constructor(options: GraphRAGEngineOptions) {
    this.storage = options.storage;
    this.vectorEngine = options.vectorEngine;
    this.entityExtractor = options.entityExtractor || new RuleBasedEntityExtractor();
    this.ranker = options.ranker || new GraphRanker();
    this.assembler = options.assembler || new ContextAssembler();
    this.generator = options.generator || new LocalDeterministicAnswerGenerator();
    this.traversal = options.traversal || new GraphTraversalEngine(this.storage);
    this.config = { ...DEFAULT_RAG_CONFIG, ...options.defaultConfig };
  }

  async query(req: RAGQueryRequest): Promise<RAGResponse> {
    const startTime = performance.now();
    const topK = req.top_k ?? this.config.top_k;
    const useGraph = req.use_graph ?? this.config.use_graph;
    const graphDepth = req.graph_depth ?? this.config.graph_depth;

    // Step 1: Initial Query Entity Detection
    const detectedMentions = await this.entityExtractor.extract(req.query);
    const queryEntities: Entity[] = [];
    for (const m of detectedMentions) {
      const match = this.storage.findEntities({ nameQuery: m.name })[0];
      if (match) {
        queryEntities.push(match);
      }
    }

    // Step 2: Hybrid Retrieval via Vector Engine (if collection provided and engine initialized)
    const passages: RAGPassage[] = [];
    let vectorMax = 0.0;
    let sparseMax = 0.0;

    if (this.vectorEngine && req.collection) {
      try {
        const searchRes = await this.vectorEngine.search({
          collection: req.collection,
          query: req.query,
          mode: "hybrid",
          top_k: topK * 2, // overfetch for graph reranking
        });

        for (const r of searchRes.results) {
          passages.push({
            chunk_id: String(r.metadata?.chunk_id || r.id),
            document_id: String(r.metadata?.document_id || req.collection),
            text: r.text || "",
            score: r.score,
            source_ref: r.content_ref,
          });
          if (r.dense_score !== undefined) vectorMax = Math.max(vectorMax, r.dense_score);
          if (r.sparse_score !== undefined) sparseMax = Math.max(sparseMax, r.sparse_score);
        }
      } catch {
        // Fallback if collection doesn't exist
      }
    }

    // Step 3: Graph Expansion
    const expandedEntities: Entity[] = [...queryEntities];
    const expandedRelationships: Relationship[] = [];
    const expandedEvidence: Evidence[] = [];

    if (useGraph) {
      const entitiesToExpand: Entity[] = [...queryEntities];

      // If no query entities directly found, inspect entities mentioned in top passages
      if (entitiesToExpand.length === 0 && passages.length > 0) {
        for (const p of passages.slice(0, 3)) {
          const pMentions = await this.entityExtractor.extract(p.text);
          for (const pm of pMentions) {
            const ent = this.storage.findEntities({ nameQuery: pm.name })[0];
            if (ent && !entitiesToExpand.some((e) => e.entity_id === ent.entity_id)) {
              entitiesToExpand.push(ent);
            }
          }
        }
      }

      // Perform BFS traversal from anchor entities
      for (const anchor of entitiesToExpand) {
        const sub = this.traversal.neighbors(anchor.entity_id, {
          depth: graphDepth,
          limits: {
            max_nodes: this.config.max_graph_nodes,
            max_edges: this.config.max_graph_edges,
          },
        });

        for (const n of sub.nodes) {
          if (!expandedEntities.some((e) => e.entity_id === n.entity_id)) {
            expandedEntities.push(n);
          }
        }
        for (const edge of sub.edges) {
          if (!expandedRelationships.some((r) => r.relationship_id === edge.relationship_id)) {
            expandedRelationships.push(edge);
          }
        }
        for (const ev of sub.evidence) {
          if (!expandedEvidence.some((e) => e.evidence_id === ev.evidence_id)) {
            expandedEvidence.push(ev);
          }
        }
      }

      // Add evidence passages if passages list is empty
      if (passages.length === 0 && expandedEvidence.length > 0) {
        for (const ev of expandedEvidence.slice(0, topK)) {
          passages.push({
            chunk_id: ev.chunk_id,
            document_id: ev.document_id,
            text: ev.source_text_reference,
            score: ev.confidence,
          });
        }
      }
    }

    // Step 4: Graph-Aware Reranking
    const scoringInputs: CandidateScoringInput[] = passages.map((p) => {
      // Determine shortest graph distance from passage to query entities
      let minDistance = 999;
      const matchedEnts: Entity[] = [];
      const matchedRels: Relationship[] = [];

      for (const qEnt of expandedEntities) {
        if (p.text.toLowerCase().includes(qEnt.canonical_name.toLowerCase())) {
          minDistance = Math.min(
            minDistance,
            queryEntities.some((qe) => qe.entity_id === qEnt.entity_id) ? 0 : 1
          );
          matchedEnts.push(qEnt);
        }
      }

      // Relate to supporting evidence
      const supportingEv = expandedEvidence.filter(
        (ev) => ev.chunk_id === p.chunk_id || p.text.includes(ev.source_text_reference)
      );

      return {
        passage: p,
        vectorScore: p.score,
        sparseScore: p.score,
        graphDistance: minDistance,
        matchedEntities: matchedEnts,
        matchedRelationships: matchedRels,
        supportingEvidence: supportingEv,
      };
    });

    const reranked = this.ranker.rerank(scoringInputs).slice(0, topK);
    const finalPassages = reranked.map((r) => r.passage);

    // Step 5: Context Assembly
    const context = this.assembler.assemble({
      query: req.query,
      passages: finalPassages,
      entities: expandedEntities,
      relationships: expandedRelationships,
      evidence: expandedEvidence,
      vectorMaxScore: vectorMax,
      sparseMaxScore: sparseMax,
    });

    // Step 6: Grounded Answer Synthesis
    let answer = undefined;
    if (req.generate_answer !== false) {
      answer = await this.generator.generate(context);
    }

    // Compile provenance
    const provenance: Array<{ entity_or_rel: string; evidence: Evidence }> = [];
    for (const r of expandedRelationships) {
      for (const evId of r.evidence_ids) {
        const ev = expandedEvidence.find((e) => e.evidence_id === evId);
        if (ev) {
          provenance.push({
            entity_or_rel: `${r.subject_entity_id} -[${r.predicate}]-> ${r.object_entity_id}`,
            evidence: ev,
          });
        }
      }
    }

    const latencyMs = Number((performance.now() - startTime).toFixed(2));

    return {
      query: req.query,
      answer,
      context,
      latency_ms: latencyMs,
      provenance,
      retrieval_metadata: {
        query_entities_found: queryEntities.length,
        graph_expanded_nodes: expandedEntities.length,
        graph_expanded_edges: expandedRelationships.length,
        graph_depth_used: graphDepth,
        passages_evaluated: passages.length,
      },
    };
  }
}
