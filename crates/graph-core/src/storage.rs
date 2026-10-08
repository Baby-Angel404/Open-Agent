use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub entity_id: String,
    pub canonical_name: String,
    pub entity_type: String,
    pub aliases: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relationship {
    pub relationship_id: String,
    pub subject_entity_id: String,
    pub predicate: String,
    pub object_entity_id: String,
    pub confidence: f64,
    pub evidence_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub evidence_id: String,
    pub document_id: String,
    pub chunk_id: String,
    pub source_text_reference: String,
    pub extraction_method: String,
    pub confidence: f64,
    pub created_at: String,
}

#[derive(Default)]
pub struct GraphStore {
    pub entities: HashMap<String, Entity>,
    pub relationships: HashMap<String, Relationship>,
    pub evidence: HashMap<String, Evidence>,
    pub out_edges: HashMap<String, HashSet<String>>,
    pub in_edges: HashMap<String, HashSet<String>>,
}

impl GraphStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert_entity(&mut self, entity: Entity) {
        self.entities.insert(entity.entity_id.clone(), entity);
    }

    pub fn insert_relationship(&mut self, rel: Relationship) -> Result<(), &'static str> {
        if !self.entities.contains_key(&rel.subject_entity_id) {
            return Err("Subject entity not found");
        }
        if !self.entities.contains_key(&rel.object_entity_id) {
            return Err("Object entity not found");
        }

        self.out_edges
            .entry(rel.subject_entity_id.clone())
            .or_default()
            .insert(rel.relationship_id.clone());

        self.in_edges
            .entry(rel.object_entity_id.clone())
            .or_default()
            .insert(rel.relationship_id.clone());

        self.relationships.insert(rel.relationship_id.clone(), rel);
        Ok(())
    }

    pub fn get_outbound(&self, entity_id: &str) -> Vec<&Relationship> {
        self.out_edges
            .get(entity_id)
            .map(|ids| ids.iter().filter_map(|id| self.relationships.get(id)).collect())
            .unwrap_or_default()
    }

    pub fn get_inbound(&self, entity_id: &str) -> Vec<&Relationship> {
        self.in_edges
            .get(entity_id)
            .map(|ids| ids.iter().filter_map(|id| self.relationships.get(id)).collect())
            .unwrap_or_default()
    }
}
