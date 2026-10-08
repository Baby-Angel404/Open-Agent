import * as path from "node:path";
import { FileSystemGraphStorage, GraphRAGEngine } from "@open-agent/graph";
import {
  VectorEngine,
  FileSystemStorageBackend,
  LocalHashEmbeddingProvider,
} from "@open-agent/vector";

export async function handleRagQuery(
  question: string,
  options: {
    collection?: string;
    expandGraph?: boolean;
    depth?: number;
    topK?: number;
    path?: string;
    vectorPath?: string;
  } = {}
): Promise<void> {
  const graphBasePath = options.path
    ? path.resolve(process.cwd(), options.path)
    : path.resolve(process.cwd(), ".graph-store");
  const graphStorage = new FileSystemGraphStorage(graphBasePath);
  await graphStorage.load();

  let vectorEngine: VectorEngine | undefined;
  if (options.collection) {
    const vectorBasePath = options.vectorPath
      ? path.resolve(process.cwd(), options.vectorPath)
      : path.resolve(process.cwd(), ".vector-store");
    const vStorage = new FileSystemStorageBackend(vectorBasePath);
    const provider = new LocalHashEmbeddingProvider(64);
    vectorEngine = new VectorEngine({ storage: vStorage, defaultEmbeddingProvider: provider });
    await vectorEngine.init();
  }

  const ragEngine = new GraphRAGEngine({
    storage: graphStorage,
    vectorEngine,
  });

  const expandGraph = options.expandGraph !== false;
  const maxDepth = options.depth ? Number(options.depth) : 2;
  const topK = options.topK ? Number(options.topK) : 5;

  console.log(`=== OpenAgent Grounded Graph RAG Query ===`);
  console.log(`Question:       "${question}"`);
  console.log(`Collection:     ${options.collection || "(None - Pure Graph RAG)"}`);
  console.log(`Expand Graph:   ${expandGraph} (Depth: ${maxDepth})`);
  console.log(`Top-K Chunks:   ${topK}`);
  console.log("-".repeat(70));

  const result = await ragEngine.query({
    query: question,
    collection: options.collection,
    use_graph: expandGraph,
    graph_depth: maxDepth,
    top_k: topK,
    generate_answer: true,
  });

  console.log(`\nSynthesized Grounded Answer:`);
  console.log(result.answer?.text || "(No answer generated)");

  console.log(`\nRetrieval & Provenance Metrics:`);
  console.log(`  Status:            ${result.answer?.status || "UNSUPPORTED"}`);
  console.log(
    `  Confidence:        ${result.answer ? (result.answer.confidence * 100).toFixed(1) + "%" : "0%"}`
  );
  console.log(`  Latency:           ${result.latency_ms.toFixed(2)}ms`);
  console.log(`  Entities Used:     ${result.context.entities.length}`);
  console.log(`  Relationships:     ${result.context.relationships.length}`);
  console.log(`  Passages:          ${result.context.passages.length}`);

  if (result.context.passages.length > 0) {
    console.log(`\nPassage Citations (${result.context.passages.length}):`);
    for (const p of result.context.passages) {
      console.log(
        `  - [${p.document_id} / Chunk ${p.chunk_id}] "${p.text.substring(0, 100)}..." (Score: ${p.score.toFixed(3)})`
      );
    }
  }

  if (result.answer?.supported_claims && result.answer.supported_claims.length > 0) {
    console.log(`\nSupported Claims (${result.answer.supported_claims.length}):`);
    for (const c of result.answer.supported_claims) {
      console.log(`  - Claim: "${c.claim}"`);
      if (c.citations.length > 0) {
        console.log(`    Citations: ${c.citations.join(", ")}`);
      }
    }
  }
}
