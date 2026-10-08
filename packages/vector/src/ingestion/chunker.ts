import * as crypto from "node:crypto";
import { DocumentChunk, ChunkingConfig, DocumentInput } from "../types/index.js";

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  chunk_size: 500,
  overlap: 50,
  separators: ["\n\n", "\n", ". ", " "],
};

/**
 * Splits text into semantic chunks while respecting hierarchy and configured overlap.
 */
export function chunkText(
  text: string,
  docId: string,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG,
  extraMetadata: Record<string, unknown> = {}
): DocumentChunk[] {
  const chunkSize = Math.max(50, config.chunk_size);
  const overlap = Math.max(0, Math.min(config.overlap, Math.floor(chunkSize / 2)));
  const separators = config.separators || DEFAULT_CHUNKING_CONFIG.separators!;

  if (!text || text.trim().length === 0) {
    return [];
  }

  // Recursive splitter
  function split(content: string, sepIdx: number): string[] {
    if (content.length <= chunkSize) {
      return [content.trim()].filter(Boolean);
    }
    if (sepIdx >= separators.length) {
      // Hard split fallback
      const chunks: string[] = [];
      let start = 0;
      while (start < content.length) {
        chunks.push(content.slice(start, start + chunkSize).trim());
        start += chunkSize - overlap;
      }
      return chunks.filter(Boolean);
    }

    const sep = separators[sepIdx];
    const parts = content.split(sep);
    const result: string[] = [];
    let current = "";

    for (const part of parts) {
      const candidate = current ? current + sep + part : part;
      if (candidate.length <= chunkSize) {
        current = candidate;
      } else {
        if (current) {
          result.push(current.trim());
        }
        if (part.length > chunkSize) {
          // Recurse into finer separator
          result.push(...split(part, sepIdx + 1));
          current = "";
        } else {
          current = part;
        }
      }
    }

    if (current) {
      result.push(current.trim());
    }

    return result.filter(Boolean);
  }

  const rawChunks = split(text, 0);
  const documentChunks: DocumentChunk[] = [];

  for (let i = 0; i < rawChunks.length; i++) {
    const chunkId = `${docId}_chk_${i}`;
    documentChunks.push({
      chunk_id: chunkId,
      document_id: docId,
      sequence_number: i,
      text: rawChunks[i],
      metadata: {
        ...extraMetadata,
        document_id: docId,
        chunk_id: chunkId,
        sequence_number: i,
        total_chunks: rawChunks.length,
        char_count: rawChunks[i].length,
      },
    });
  }

  return documentChunks;
}

export function ingestDocument(doc: DocumentInput, config?: ChunkingConfig): DocumentChunk[] {
  const docId = doc.id || `doc_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const metadata: Record<string, unknown> = {
    source: doc.source || "inline_text",
    ...(doc.metadata || {}),
  };

  return chunkText(doc.text, docId, config, metadata);
}
