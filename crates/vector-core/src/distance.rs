#[inline]
pub fn dot_product(a: &[f32], b: &[f32]) -> f32 {
    assert_eq!(a.len(), b.len(), "Vector dimension mismatch in dot product");
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

#[inline]
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    assert_eq!(a.len(), b.len(), "Vector dimension mismatch in cosine similarity");
    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;

    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        norm_a += x * x;
        norm_b += y * y;
    }

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    let score = dot / (norm_a.sqrt() * norm_b.sqrt());
    score.clamp(-1.0, 1.0)
}

#[inline]
pub fn euclidean_distance(a: &[f32], b: &[f32]) -> f32 {
    assert_eq!(a.len(), b.len(), "Vector dimension mismatch in euclidean distance");
    let mut sum_sq = 0.0f32;
    for (x, y) in a.iter().zip(b.iter()) {
        let diff = x - y;
        sum_sq += diff * diff;
    }
    sum_sq.sqrt()
}

#[inline]
pub fn euclidean_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dist = euclidean_distance(a, b);
    1.0 / (1.0 + dist)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine() {
        let v1 = [1.0, 0.0, 0.0];
        let v2 = [1.0, 0.0, 0.0];
        assert!((cosine_similarity(&v1, &v2) - 1.0).abs() < 1e-6);
    }
}
