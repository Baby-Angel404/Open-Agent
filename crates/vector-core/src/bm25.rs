use std::collections::HashMap;

pub fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|t| t.len() > 1)
        .map(|s| s.to_string())
        .collect()
}

pub struct BM25Engine {
    k1: f32,
    b: f32,
    doc_lengths: HashMap<String, usize>,
    inverted_index: HashMap<String, HashMap<String, u32>>,
    total_len: usize,
}

impl BM25Engine {
    pub fn new(k1: f32, b: f32) -> Self {
        Self {
            k1,
            b,
            doc_lengths: HashMap::new(),
            inverted_index: HashMap::new(),
            total_len: 0,
        }
    }

    pub fn add_document(&mut self, id: String, text: &str) {
        let tokens = tokenize(text);
        let len = tokens.len();
        self.doc_lengths.insert(id.clone(), len);
        self.total_len += len;

        let mut tf_map = HashMap::new();
        for t in tokens {
            *tf_map.entry(t).or_insert(0) += 1;
        }

        for (term, count) in tf_map {
            self.inverted_index
                .entry(term)
                .or_insert_with(HashMap::new)
                .insert(id.clone(), count);
        }
    }

    pub fn search(&self, query: &str, top_k: usize) -> Vec<(String, f32)> {
        let query_tokens = tokenize(query);
        let n = self.doc_lengths.len() as f32;
        if n == 0.0 || query_tokens.is_empty() {
            return Vec::new();
        }

        let avgdl = (self.total_len as f32) / n;
        let mut scores: HashMap<String, f32> = HashMap::new();

        for term in query_tokens {
            if let Some(postings) = self.inverted_index.get(&term) {
                let df = postings.len() as f32;
                let idf = (1.0 + (n - df + 0.5) / (df + 0.5)).ln();

                for (doc_id, &tf) in postings.iter() {
                    let tf_f32 = tf as f32;
                    let doc_len = *self.doc_lengths.get(doc_id).unwrap_or(&0) as f32;
                    let num = tf_f32 * (self.k1 + 1.0);
                    let den = tf_f32 + self.k1 * (1.0 - self.b + self.b * (doc_len / avgdl));
                    *scores.entry(doc_id.clone()).or_insert(0.0) += idf * (num / den);
                }
            }
        }

        let mut ranked: Vec<(String, f32)> = scores.into_iter().collect();
        ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        ranked.truncate(top_k);
        ranked
    }
}
