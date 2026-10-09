# Phase 10 Benchmark Results

## Hardware & Execution Environment

| Property                | Value                                                    |
| :---------------------- | :------------------------------------------------------- |
| **OS / Platform**       | linux (x64, 7.2.9-zen1-1-zen)                            |
| **CPU Architecture**    | 8 cores (11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz) |
| **Physical Memory**     | 7.45 GB                                                  |
| **Node.js Runtime**     | v20.18.0                                                 |
| **Execution Timestamp** | 2026-10-09T21:38:03.039Z                                 |

---

## Benchmark Metrics & Performance Baseline

### 1. Application Startup Latency

- **Cold Startup Latency**: **34.97 ms** (Includes full filesystem directory check, vault initialization, SQLite/JSON vector & graph storage discovery, audit store setup, and local loopback API listener binding)
- **Warm Startup Median Latency**: **27.63 ms**
- **Warm Startup p95 Latency**: **28.12 ms**

### 2. Document Ingestion Throughput

- **Workload**: 50 distinct text documents (50 chunks)
- **Ingestion Throughput**: **1408.7 documents/sec**
- **Chunk Ingestion Rate**: **1408.7 chunks/sec**
- **Median Latency per Document**: **0.57 ms**
- **p95 Latency per Document**: **1.35 ms**

### 3. Hybrid Retrieval & Search Latency

- **Workload**: 50 hybrid vector + sparse BM25 retrieval queries
- **Median Query Latency**: **0.79 ms**
- **p95 Query Latency**: **1.65 ms**
- **Min / Max Latency**: 0.57 ms / 2.03 ms

### 4. Policy Engine Evaluation Overhead

- **Workload**: 1,000 deterministic action evaluations against multi-rule policy
- **Throughput**: **150,544 evaluations/sec**
- **Median Evaluation Latency**: **5.8 µs**
- **p95 Evaluation Latency**: **7 µs**

### 5. Cryptographic Protocol Operations (Ed25519)

- **Digital Signing Throughput**: **1,528 ops/sec** (Median: 0.527 ms)
- **Signature Verification Throughput**: **2,930 ops/sec** (Median: 0.26 ms)

### 6. Concurrent Session Scalability

- **Workload**: 25 concurrent session creations via IPC dispatcher
- **Success Rate**: **100%** (25/25 sessions)
- **Total Duration**: **7.9 ms**
- **Average Overhead per Session**: **0.32 ms**

### 7. Memory Utilization Under Bounded Workload

- **Process RSS**: **68.38 MB**
- **Heap Used**: **13.5 MB**
- **Heap Allocated**: **19.09 MB**

---

## Reproducibility Command

To reproduce this benchmark suite locally:

```bash
npm run benchmark
```
