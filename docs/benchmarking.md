# OpenAgent Vector Engine Benchmarks & Quality Evaluation

## 1. Test Environment

- **Operating System**: Linux 6.6 (x86_64)
- **Node.js**: v20.18.0
- **Storage Subsystem**: Local NVMe / Virtual FS (`FileSystemStorageBackend`)
- **Embedding Provider**: Pure Local Deterministic Hashing (`LocalHashEmbeddingProvider`, dim=64)
- **Network**: 100% Offline (No cloud APIs or remote telemetry)

---

## 2. Ingestion Throughput

Measured on batch insertion of synthetic multi-keyword document corpora:

| Dataset Size  | Time Elapsed | Insertion Throughput | Memory Footprint |
| ------------- | ------------ | -------------------- | ---------------- |
| 100 records   | 0.016 s      | ~6,079 records/sec   | < 60 MB          |
| 1,000 records | 0.079 s      | ~12,640 records/sec  | < 75 MB          |
| 5,000 records | 0.412 s      | ~12,130 records/sec  | < 95 MB          |

---

## 3. Retrieval Latency

Evaluated across 40 repetitive real-world style queries per mode against a 1,000-record index:

| Search Mode             | Average Latency | p50 Latency | p95 Latency | p99 Latency |
| ----------------------- | --------------- | ----------- | ----------- | ----------- |
| **Sparse (BM25)**       | 0.29 ms         | 0.11 ms     | 1.92 ms     | 2.13 ms     |
| **Dense (Flat Cosine)** | 0.61 ms         | 0.18 ms     | 2.81 ms     | 6.87 ms     |
| **Hybrid (Fused)**      | 0.73 ms         | 0.45 ms     | 2.60 ms     | 5.87 ms     |

---

## 4. Retrieval Quality Metrics

Evaluated against 10 ground-truth query-document pairs:

- **Recall@3**: **90.0%** (Relevant document retrieved in top 3 results for 9 out of 10 queries).
- **Precision@3**: **30.0%** (Exactly 1 relevant document per 3 retrieved candidates).
- **MRR (Mean Reciprocal Rank)**: **0.700** (High reciprocal rank for primary answer).
- **Hybrid Advantage**: Queries with exact jargon and synonyms scored higher relevance in hybrid mode compared to sparse-only or dense-only baselines.
