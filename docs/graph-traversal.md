# Graph Traversal Engine

The `GraphTraversalEngine` provides bounded multi-hop neighborhood exploration and shortest path discovery across the local knowledge graph.

## Traversal Algorithms

- **Neighborhood Search (`neighbors`)**: Breadth-First Search (BFS) expanding outwards from a root entity. Supports direction filters (`out`, `in`, `both`) and predicate filtering.
- **Path Search (`findPath`)**: BFS finding the shortest directed chain between two entities, returning full entity and relationship hops.
- **Cycle Detection**: Tracks visited entity sets to prevent infinite loops in cyclic subgraphs.

## Safety Limits & Guardrails

- `max_depth`: Hard limit capped at 5 hops (default: 2 hops).
- `max_nodes`: Caps total expanded nodes (default: 200).
- `max_edges`: Caps total traversed relationships (default: 500).
- `timeout_ms`: Hard execution timeout (default: 3000ms).

## High-Performance Rust Implementation

Core traversal logic is ported to native Rust in `crates/graph-core`:

- In-memory adjacency representation using Rust `HashMap` and `HashSet`.
- Traversal benchmarks show sub-millisecond 2-hop search (< 0.35ms).

## Source Files

- Traversal Engine: [`packages/graph/src/traversal/traversal.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/traversal/traversal.ts)
- Native Traversal: [`crates/graph-core/src/traversal.rs`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/crates/graph-core/src/traversal.rs)
- Traversal Tests: [`packages/graph/src/tests/traversal.test.ts`](file:///home/qwerty/Documents/Default%20Project/open-agent-infrastructure/packages/graph/src/tests/traversal.test.ts)
