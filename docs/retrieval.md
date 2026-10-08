# OpenAgent Retrieval & Hybrid Ranking Specification

## 1. Dense Vector Search

Dense search measures geometric similarity between a query vector \( \mathbf{q} \) and document vectors \( \mathbf{d} \).

### Distance Metrics

1. **Cosine Similarity**:
   $$\text{sim}_{\text{cos}}(\mathbf{q}, \mathbf{d}) = \frac{\mathbf{q} \cdot \mathbf{d}}{\|\mathbf{q}\| \|\mathbf{d}\|} = \frac{\sum_{i=1}^n q_i d_i}{\sqrt{\sum_{i=1}^n q_i^2} \sqrt{\sum_{i=1}^n d_i^2}}$$
   Yields scores in range \([-1.0, 1.0]\). If either vector norm is 0, returns 0.

2. **Dot Product**:
   $$\text{sim}_{\text{dot}}(\mathbf{q}, \mathbf{d}) = \mathbf{q} \cdot \mathbf{d} = \sum_{i=1}^n q_i d_i$$

3. **Euclidean Distance & Similarity**:
   $$D_{\text{euc}}(\mathbf{q}, \mathbf{d}) = \sqrt{\sum_{i=1}^n (q_i - d_i)^2}$$
   Converted to bounded similarity via inverted exponential:
   $$\text{sim}_{\text{euc}}(\mathbf{q}, \mathbf{d}) = \frac{1}{1 + D_{\text{euc}}(\mathbf{q}, \mathbf{d})}$$
   Yields scores in range \([0.0, 1.0]\).

---

## 2. Sparse Lexical Search (Okapi BM25)

The sparse index evaluates term matching using the Okapi BM25 ranking function.

### Formula

$$\text{Score}_{\text{BM25}}(D, Q) = \sum_{t \in Q} \text{IDF}(t) \cdot \frac{f(t, D) \cdot (k_1 + 1)}{f(t, D) + k_1 \cdot \left(1 - b + b \cdot \frac{|D|}{\text{avgdl}}\right)}$$

Where:

- \( f(t, D) \): Term frequency of token \( t \) in document \( D \).
- \( |D| \): Document length in tokens.
- \( \text{avgdl} \): Average document length across the collection.
- \( k_1 = 1.5 \): Term frequency saturation parameter.
- \( b = 0.75 \): Document length normalization parameter.
- Robertson-Spärck Jones Inverse Document Frequency (with floor smoothing):
  $$\text{IDF}(t) = \ln\left( \frac{N - n(t) + 0.5}{n(t) + 0.5} + 1 \right)$$
  Where \( N \) is total documents and \( n(t) \) is the count of documents containing \( t \).

---

## 3. Hybrid Score Fusion & Normalization

To combine disparate score spaces (unbounded BM25 scores vs bounded cosine similarity), scores are normalized prior to convex combination.

### Min-Max Normalization

$$\hat{s}_i = \frac{s_i - \min(S)}{\max(S) - \min(S)}$$
If \( \max(S) = \min(S) \), all items receive \( \hat{s}_i = 1.0 \).

### Weighted Convex Fusion

$$\text{Score}_{\text{hybrid}}(d) = w_{\text{dense}} \cdot \hat{s}_{\text{dense}}(d) + w_{\text{sparse}} \cdot \hat{s}_{\text{sparse}}(d)$$

Defaults:

- \( w_{\text{dense}} = 0.7 \)
- \( w_{\text{sparse}} = 0.3 \)
- \( w_{\text{dense}} + w_{\text{sparse}} = 1.0 \)

Candidates present in only one index are padded with a normalized score of \( 0.0 \) for the missing modality.

---

## 4. Metadata Filtering

Metadata filtering supports pre-filtering before candidate scoring or post-filtering.

### Supported Filter Operators

| Operator                    | Syntax                                    | Description                     |
| --------------------------- | ----------------------------------------- | ------------------------------- |
| Equality                    | `{ "category": "security" }`              | Exact match                     |
| Not Equal                   | `{ "status": { "ne": "archived" } }`      | Inequality match                |
| Numeric Greater Than        | `{ "priority": { "gt": 5 } }`             | Strict inequality               |
| Numeric Greater or Equal    | `{ "priority": { "gte": 5 } }`            | Non-strict inequality           |
| Numeric Less Than           | `{ "age": { "lt": 30 } }`                 | Strict inequality               |
| Numeric Less or Equal       | `{ "age": { "lte": 30 } }`                | Non-strict inequality           |
| Set Membership              | `{ "tag": { "in": ["auth", "token"] } }`  | Value in array                  |
| Set Non-Membership          | `{ "tag": { "nin": ["draft"] } }`         | Value not in array              |
| Substring / Array Inclusion | `{ "keywords": { "contains": "audit" } }` | Substring or list element match |
