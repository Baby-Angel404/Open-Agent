import { SubsystemLifecycle } from "../../lifecycle.js";
import {
  IPCResponse,
  IngestDocumentParams,
  QueryRAGParams,
  GraphQueryData,
} from "../../../types/ipc.js";
import { Entity, Relationship } from "@open-agent/graph";

export async function handleRagIngest(
  lifecycle: SubsystemLifecycle,
  params: IngestDocumentParams
): Promise<IPCResponse<{ ingested: boolean; docId: string; chunksCount: number }>> {
  const vectorEngine = lifecycle.getVectorEngine();
  const graphStorage = lifecycle.getGraphStorage();

  if (!vectorEngine || !graphStorage) {
    return {
      success: false,
      error: { code: "RAG_UNAVAILABLE", message: "Knowledge base subsystems not initialized" },
    };
  }

  if (!params.title || !params.content) {
    return {
      success: false,
      error: { code: "INVALID_INPUT", message: "Both title and content are required" },
    };
  }

  try {
    const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const collectionName = "default_desktop";

    if (!vectorEngine.getCollection(collectionName)) {
      await vectorEngine.createCollection({
        name: collectionName,
        collection_id: collectionName,
        dimension: 128,
      });
    }

    const records = await vectorEngine.ingestDocument(collectionName, {
      id: docId,
      text: params.content,
      metadata: { title: params.title, tags: params.tags || [] },
    });

    const now = new Date().toISOString();
    await graphStorage.createEntity({
      entity_id: docId,
      canonical_name: params.title,
      entity_type: "DOCUMENT",
      aliases: [params.title],
      metadata: { tags: params.tags || [] },
      created_at: now,
      updated_at: now,
    });
    await graphStorage.save();

    return {
      success: true,
      data: { ingested: true, docId, chunksCount: records.length },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: { code: "INGEST_FAILED", message: err instanceof Error ? err.message : String(err) },
    };
  }
}

export async function handleRagQuery(
  lifecycle: SubsystemLifecycle,
  params: QueryRAGParams
): Promise<IPCResponse<{ answer: string; sources: unknown[] }>> {
  const ragEngine = lifecycle.getRagEngine();
  if (!ragEngine) {
    return {
      success: false,
      error: { code: "RAG_UNAVAILABLE", message: "Graph RAG engine is not initialized" },
    };
  }

  try {
    const response = await ragEngine.query({
      query: params.query,
      collection: "default_desktop",
    });
    const answerText = response.answer ? response.answer.text : "No direct answer generated.";
    const sources = response.context ? response.context.passages : [];

    return {
      success: true,
      data: {
        answer: answerText,
        sources,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: { code: "QUERY_FAILED", message: err instanceof Error ? err.message : String(err) },
    };
  }
}

export function handleRagGetGraph(lifecycle: SubsystemLifecycle): IPCResponse<GraphQueryData> {
  const graphStorage = lifecycle.getGraphStorage();
  if (!graphStorage) {
    return {
      success: false,
      error: { code: "GRAPH_UNAVAILABLE", message: "Graph storage is not initialized" },
    };
  }

  try {
    const entities = graphStorage.listEntities().map((e: Entity) => ({
      id: e.entity_id,
      name: e.canonical_name,
      type: e.entity_type,
    }));

    const relations = graphStorage.listRelationships().map((r: Relationship) => ({
      sourceId: r.subject_entity_id,
      targetId: r.object_entity_id,
      relationType: r.predicate,
    }));

    return { success: true, data: { entities, relations } };
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: "GET_GRAPH_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
