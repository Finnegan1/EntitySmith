use std::collections::HashMap;
use std::time::UNIX_EPOCH;

use super::{
    AdapterAttributeResult, AdapterEntityResult, AdapterProfileResult,
    AdapterDeclaredFk, SourceAdapter, TopValueRaw,
};

/// Rows read to compute statistics.
const SAMPLE_ROWS: usize = 10_000;
const TOP_VALUES_LIMIT: usize = 5;

pub struct CsvAdapter {
    path: String,
}

impl CsvAdapter {
    pub fn new(path: &str) -> Self {
        Self { path: path.to_string() }
    }
}

impl SourceAdapter for CsvAdapter {
    fn fingerprint(&self) -> Result<String, String> {
        let meta = std::fs::metadata(&self.path)
            .map_err(|e| format!("Cannot stat file: {e}"))?;
        let size = meta.len();
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        Ok(format!("{size}:{mtime}"))
    }

    fn profile(&self) -> Result<AdapterProfileResult, String> {
        let mut rdr = csv::ReaderBuilder::new()
            .flexible(true)
            .trim(csv::Trim::All)
            .from_path(&self.path)
            .map_err(|e| format!("Cannot open CSV file: {e}"))?;

        let headers: Vec<String> = rdr
            .headers()
            .map_err(|e| format!("Cannot read CSV headers: {e}"))?
            .iter()
            .map(|h| h.to_string())
            .collect();

        if headers.is_empty() {
            return Ok(AdapterProfileResult {
                entities: vec![AdapterEntityResult {
                    name: file_stem(&self.path),
                    row_count: 0,
                    attributes: vec![],
                    declared_fks: vec![],
                }],
            });
        }

        let n_cols = headers.len();
        let mut col_values: Vec<Vec<String>> = vec![vec![]; n_cols];
        let mut total_rows: i64 = 0;

        for result in rdr.records() {
            let record = result.map_err(|e| format!("CSV read error: {e}"))?;
            total_rows += 1;
            if total_rows as usize <= SAMPLE_ROWS {
                for (i, field) in record.iter().enumerate() {
                    if i < n_cols {
                        col_values[i].push(field.to_string());
                    }
                }
            }
        }

        let sample_n = total_rows.min(SAMPLE_ROWS as i64);

        let attributes = headers
            .iter()
            .enumerate()
            .map(|(i, name)| {
                let vals = &col_values[i];
                build_attribute(name, vals, sample_n)
            })
            .collect();

        Ok(AdapterProfileResult {
            entities: vec![AdapterEntityResult {
                name: file_stem(&self.path),
                row_count: total_rows,
                attributes,
                declared_fks: vec![],
            }],
        })
    }
}

// ── Column statistics ─────────────────────────────────────────────────────────

fn build_attribute(
    name: &str,
    values: &[String],
    sample_n: i64,
) -> AdapterAttributeResult {
    if values.is_empty() {
        return AdapterAttributeResult {
            name: name.to_string(),
            inferred_type: "text".to_string(),
            is_nullable: true,
            is_pk: false,
            null_pct: 0.0,
            unique_pct: 0.0,
            min_value: None,
            max_value: None,
            top_values: vec![],
        };
    }

    let null_n = values.iter().filter(|v| v.trim().is_empty()).count() as i64;
    let null_pct = null_n as f64 / sample_n as f64;

    let non_null: Vec<&str> = values.iter().filter(|v| !v.trim().is_empty()).map(|s| s.as_str()).collect();
    let distinct_n = {
        let mut set = std::collections::HashSet::new();
        for v in &non_null { set.insert(*v); }
        set.len()
    };
    let unique_pct = if sample_n > 0 { distinct_n as f64 / sample_n as f64 } else { 0.0 };

    let inferred_type = infer_type(&non_null);

    // Min / max for numeric or text.
    let (min_value, max_value) = if !non_null.is_empty() {
        if inferred_type == "integer" {
            let nums: Vec<i64> = non_null.iter().filter_map(|v| v.parse().ok()).collect();
            (nums.iter().min().map(|n| n.to_string()), nums.iter().max().map(|n| n.to_string()))
        } else if inferred_type == "real" {
            let nums: Vec<f64> = non_null.iter().filter_map(|v| v.parse().ok()).collect();
            let mn = nums.iter().cloned().reduce(f64::min).map(|n| format!("{n:.4}"));
            let mx = nums.iter().cloned().reduce(f64::max).map(|n| format!("{n:.4}"));
            (mn, mx)
        } else {
            let mut sorted = non_null.clone();
            sorted.sort_unstable();
            (
                sorted.first().map(|s| s.to_string()),
                sorted.last().map(|s| s.to_string()),
            )
        }
    } else {
        (None, None)
    };

    // Top values (skip high-cardinality columns).
    let top_values = if unique_pct < 0.95 {
        let mut counts: HashMap<&str, i64> = HashMap::new();
        for v in &non_null {
            *counts.entry(v).or_insert(0) += 1;
        }
        let mut sorted: Vec<(&&str, &i64)> = counts.iter().collect();
        sorted.sort_by(|a, b| b.1.cmp(a.1));
        sorted
            .into_iter()
            .take(TOP_VALUES_LIMIT)
            .map(|(v, c)| TopValueRaw { value: v.to_string(), count: *c })
            .collect()
    } else {
        vec![]
    };

    AdapterAttributeResult {
        name: name.to_string(),
        inferred_type,
        is_nullable: null_n > 0,
        is_pk: false,
        null_pct,
        unique_pct,
        min_value,
        max_value,
        top_values,
    }
}

fn infer_type(values: &[&str]) -> String {
    if values.is_empty() {
        return "text".to_string();
    }
    if values.iter().all(|v| v.parse::<i64>().is_ok()) {
        return "integer".to_string();
    }
    if values.iter().all(|v| v.parse::<f64>().is_ok()) {
        return "real".to_string();
    }
    let bools = ["true", "false", "1", "0", "yes", "no"];
    if values.iter().all(|v| bools.contains(&v.to_lowercase().as_str())) {
        return "boolean".to_string();
    }
    "text".to_string()
}

fn file_stem(path: &str) -> String {
    std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string()
}

// Suppress unused warning from AdapterDeclaredFk import.
#[allow(unused)]
fn _use_fk(_: AdapterDeclaredFk) {}
