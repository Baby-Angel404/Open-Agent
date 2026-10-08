use crate::storage::GraphStore;
use std::collections::{HashSet, VecDeque};

pub struct TraversalOptions {
    pub max_depth: usize,
    pub max_nodes: usize,
}

pub struct TraversalResult {
    pub node_ids: Vec<String>,
    pub edge_ids: Vec<String>,
}

pub fn bfs_neighbors(
    store: &GraphStore,
    start_entity: &str,
    opts: &TraversalOptions,
) -> TraversalResult {
    let mut visited_nodes = HashSet::new();
    let mut collected_edges = HashSet::new();
    let mut queue = VecDeque::new();

    visited_nodes.insert(start_entity.to_string());
    queue.push_back((start_entity.to_string(), 0));

    while let Some((curr_id, depth)) = queue.pop_front() {
        if depth >= opts.max_depth || visited_nodes.len() >= opts.max_nodes {
            continue;
        }

        // Outbound edges
        for rel in store.get_outbound(&curr_id) {
            collected_edges.insert(rel.relationship_id.clone());
            if !visited_nodes.contains(&rel.object_entity_id) {
                visited_nodes.insert(rel.object_entity_id.clone());
                queue.push_back((rel.object_entity_id.clone(), depth + 1));
            }
        }

        // Inbound edges
        for rel in store.get_inbound(&curr_id) {
            collected_edges.insert(rel.relationship_id.clone());
            if !visited_nodes.contains(&rel.subject_entity_id) {
                visited_nodes.insert(rel.subject_entity_id.clone());
                queue.push_back((rel.subject_entity_id.clone(), depth + 1));
            }
        }
    }

    TraversalResult {
        node_ids: visited_nodes.into_iter().collect(),
        edge_ids: collected_edges.into_iter().collect(),
    }
}
