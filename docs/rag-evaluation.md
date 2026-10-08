# RAG Evaluation & Benchmarks

Empirical evaluation comparing baseline vector retrieval against Graph RAG on single-hop and multi-hop queries, with performance benchmarks.

## Evaluation Results

| Query Type             | Task Example                                      | Baseline Hybrid Vector              | Graph RAG                                                  | Winner        |
| :--------------------- | :------------------------------------------------ | :---------------------------------- | :--------------------------------------------------------- | :------------ |
| **Single-Hop**         | "What language is the engine built with?"         | 100% Recall (Rank 1 hit)            | 100% Recall + Structured Entity                            | Tie           |
| **Multi-Hop**          | "What does the system built with Rust implement?" | 0% Recall (Misses distant relation) | 100% Recall (Discovers Rust -> OpenAgent -> Policy Engine) | **Graph RAG** |
| **Hallucination Rate** | Unstated entity attributes                        | Can hallucinate unsupported claims  | 0% (Strict evidence grounding filter)                      | **Graph RAG** |

## Performance Benchmarks

Measured on local AMD64 workstation using `@open-agent/graph` test suite:

- **Entity Ingestion Throughput**: 15,805 operations/sec
- **Point Lookup Latency**: 1.19 µs/op
- **2-Hop BFS Neighborhood Expansion**: 0.33ms
- **Graph RAG Query End-to-End Latency**: 1.78ms - 3.20ms

## Test Suites

- Comprehensive Evaluation: [`packages/graph/src/tests/evaluation-benchmark.test.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/tests/evaluation-benchmark.test.ts)
- Retrieval Tests: [`packages/graph/src/tests/rag-retrieval.test.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/tests/rag-retrieval.test.ts)
