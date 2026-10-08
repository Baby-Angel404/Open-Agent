# Phase 10 Benchmark Results

## Hardware & Execution Environment

| Property                | Value                                                    |
| :---------------------- | :------------------------------------------------------- |
| **OS / Platform**       | linux (x64, 7.2.9-zen1-1-zen)                            |
| **CPU Architecture**    | 8 cores (11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz) |
| **Physical Memory**     | 7.45 GB                                                  |
| **Node.js Runtime**     | v20.18.0                                                 |
| **Execution Timestamp** | 2026-10-08T23:47:06.468Z                                 |

---

## Benchmark Metrics & Performance Baseline

### 1. Application Startup Latency

- **Cold Startup Latency**: **59.65 ms** (Includes full filesystem directory check, vault initialization, SQLite/JSON vector & graph storage discovery, audit store setup, and local loopback API listener binding)
- **Warm Startup Median Latency**: **37.45 ms**
- **Warm Startup p95 Latency**: **46.91 ms**

### 2. Document Ingestion Throughput

- **Workload**: 50 distinct text documents (50 chunks)
- **Ingestion Throughput**: **721.1 documents/sec**
- **Chunk Ingestion Rate**: **721.1 chunks/sec**
- **Median Latency per Document**: **0.9 ms**
- **p95 Latency per Document**: **4.23 ms**

### 3. Hybrid Retrieval & Search Latency

- **Workload**: 50 hybrid vector + sparse BM25 retrieval queries
- **Median Query Latency**: **1.3 ms**
- **p95 Query Latency**: **5.07 ms**
- **Min / Max Latency**: 0.63 ms / 5.29 ms

### 4. Policy Engine Evaluation Overhead

- **Workload**: 1,000 deterministic action evaluations against multi-rule policy
- **Throughput**: **191,169 evaluations/sec**
- **Median Evaluation Latency**: **3.3 µs**
- **p95 Evaluation Latency**: **6.1 µs**

### 5. Cryptographic Protocol Operations (Ed25519)

- **Digital Signing Throughput**: **1,281 ops/sec** (Median: 0.704 ms)
- **Signature Verification Throughput**: **2,241 ops/sec** (Median: 0.377 ms)

### 6. Concurrent Session Scalability

- **Workload**: 25 concurrent session creations via IPC dispatcher
- **Success Rate**: **100%** (25/25 sessions)
- **Total Duration**: **12.91 ms**
- **Average Overhead per Session**: **0.52 ms**

### 7. Memory Utilization Under Bounded Workload

- **Process RSS**: **65.73 MB**
- **Heap Used**: **8.17 MB**
- **Heap Allocated**: **16.72 MB**

---

## Reproducibility Command

To reproduce this benchmark suite locally:

```bash
npm run benchmark
```
