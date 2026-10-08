use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct Candidate {
    pub id: String,
    pub score: f32,
    pub dense_score: Option<f32>,
    pub sparse_score: Option<f32>,
}

pub fn normalize_scores(items: &[(String, f32)]) -> HashMap<String, f32> {
    let mut map = HashMap::new();
    if items.is_empty() {
        return map;
    }

    let min = items.iter().map(|x| x.1).fold(f32::INFINITY, f32::min);
    let max = items.iter().map(|x| x.1).fold(f32::NEG_INFINITY, f32::max);

    if (max - min).abs() < 1e-6 {
        for (id, _) in items {
            map.insert(id.clone(), 1.0);
        }
        return map;
    }

    let range = max - min;
    for (id, val) in items {
        map.insert(id.clone(), (val - min) / range);
    }
    map
}

pub fn hybrid_rank(
    dense_items: &[(String, f32)],
    sparse_items: &[(String, f32)],
    dense_weight: f32,
    sparse_weight: f32,
    top_k: usize,
) -> Vec<Candidate> {
    let norm_dense = normalize_scores(dense_items);
    let norm_sparse = normalize_scores(sparse_items);

    let total_w = dense_weight + sparse_weight;
    let (w_d, w_s) = if total_w > 0.0 {
        (dense_weight / total_w, sparse_weight / total_w)
    } else {
        (0.5, 0.5)
    };

    let mut candidate_ids = HashMap::new();
    for (id, score) in dense_items {
        candidate_ids.entry(id.clone()).or_insert((Some(*score), None));
    }
    for (id, score) in sparse_items {
        candidate_ids
            .entry(id.clone())
            .and_modify(|e: &mut (Option<f32>, Option<f32>)| e.1 = Some(*score))
            .or_insert((None, Some(*score)));
    }

    let mut results = Vec::new();
    for (id, (d_raw, s_raw)) in candidate_ids {
        let sd = norm_dense.get(&id).copied().unwrap_or(0.0);
        let ss = norm_sparse.get(&id).copied().unwrap_or(0.0);
        let final_score = w_d * sd + w_s * ss;

        results.push(Candidate {
            id,
            score: final_score,
            dense_score: d_raw,
            sparse_score: s_raw,
        });
    }

    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(top_k);
    results
}
