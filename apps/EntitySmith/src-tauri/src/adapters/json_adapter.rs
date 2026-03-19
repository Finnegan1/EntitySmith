use std::collections::HashMap;
use std::time::UNIX_EPOCH;

use serde_json::Value;

use super::{
    AdapterAttributeResult, AdapterDeclaredFk, AdapterEntityResult,
    AdapterProfileResult, SourceAdapter, TopValueRaw,
};

const SAMPLE_ROWS: usize = 1_000;
const TOP_VALUES_LIMIT: usize = 5;

pub struct JsonAdapter {
    path: String,
}

impl JsonAdapter {
    pub fn new(path: &str) -> Self {
        Self { path: path.to_string() }
    }
}

impl SourceAdapter for JsonAdapter {
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
        let content = std::fs::read_to_string(&self.path)
            .map_err(|e| format!("Cannot read JSON file: {e}"))?;

        let records = parse_records(&content)?;
        let name = file_stem(&self.path);
        let total = records.len() as i64;

        let sample: &[Value] = if records.len() > SAMPLE_ROWS {
            &records[..SAMPLE_ROWS]
        } else {
            &records
        };

        let entity = profile_records(name, sample, total)?;

        Ok(AdapterProfileResult { entities: vec![entity] })
    }

    fn sample_rows(
        &self,
        _entity_name: &str,
        limit: usize,
    ) -> Result<Vec<HashMap<String, Option<String>>>, String> {
        let content = std::fs::read_to_string(&self.path)
            .map_err(|e| format!("Cannot read JSON file: {e}"))?;

        let records = parse_records(&content)?;
        let sample = if records.len() > limit {
            &records[..limit]
        } else {
            &records
        };

        let rows = sample
            .iter()
            .map(|rec| {
                let mut map = HashMap::new();
                if let Value::Object(obj) = rec {
                    for (k, v) in obj {
                        map.insert(k.clone(), scalar_to_string(v));
                    }
                }
                map
            })
            .collect();

        Ok(rows)
    }
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/// Accepts:
/// - A JSON array of objects at the root: `[{...}, ...]`
/// - A JSON object whose largest array-of-objects property is used as records
///   (common "envelope" pattern: `{"data": [{...}, ...], "meta": {...}}`)
/// - Newline-delimited JSON (NDJSON): one object per line
fn parse_records(content: &str) -> Result<Vec<Value>, String> {
    let trimmed = content.trim();

    // Try JSON array first.
    if trimmed.starts_with('[') {
        let arr: Value = serde_json::from_str(trimmed)
            .map_err(|e| format!("Cannot parse JSON: {e}"))?;
        match arr {
            Value::Array(items) => {
                return Ok(items.into_iter().filter(|v| v.is_object()).collect())
            }
            _ => return Err("JSON root is not an array.".to_string()),
        }
    }

    // Try a root object — look for the largest array-of-objects property.
    if trimmed.starts_with('{') {
        if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(trimmed) {
            let best = map
                .into_values()
                .filter_map(|v| match v {
                    Value::Array(items) => {
                        let objs: Vec<Value> =
                            items.into_iter().filter(|x| x.is_object()).collect();
                        if objs.is_empty() { None } else { Some(objs) }
                    }
                    _ => None,
                })
                .max_by_key(|v| v.len());

            if let Some(records) = best {
                return Ok(records);
            }
        }
    }

    // Fall back to NDJSON.
    let mut records = vec![];
    for line in trimmed.lines() {
        let l = line.trim();
        if l.is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(l) {
            Ok(v) if v.is_object() => records.push(v),
            _ => {}
        }
    }

    if records.is_empty() {
        return Err("No JSON objects found in file.".to_string());
    }
    Ok(records)
}

// ── Profiling ─────────────────────────────────────────────────────────────────

fn profile_records(
    name: String,
    sample: &[Value],
    total_rows: i64,
) -> Result<AdapterEntityResult, String> {
    if sample.is_empty() {
        return Ok(AdapterEntityResult {
            name,
            row_count: total_rows,
            attributes: vec![],
            declared_fks: vec![],
        });
    }

    // Collect all keys across the sample (preserving first-seen order).
    let mut keys: Vec<String> = vec![];
    let mut seen_keys = std::collections::HashSet::new();
    for rec in sample {
        if let Value::Object(map) = rec {
            for k in map.keys() {
                if seen_keys.insert(k.clone()) {
                    keys.push(k.clone());
                }
            }
        }
    }

    let sample_n = sample.len() as i64;

    let attributes = keys
        .iter()
        .map(|key| profile_key(key, sample, sample_n))
        .collect();

    Ok(AdapterEntityResult {
        name,
        row_count: total_rows,
        attributes,
        declared_fks: vec![],
    })
}

fn profile_key(key: &str, sample: &[Value], sample_n: i64) -> AdapterAttributeResult {
    let mut null_n: i64 = 0;
    let mut type_counts: HashMap<&str, i64> = HashMap::new();
    let mut str_values: Vec<String> = vec![];

    for rec in sample {
        let val = match rec {
            Value::Object(map) => map.get(key),
            _ => None,
        };
        match val {
            None | Some(Value::Null) => null_n += 1,
            Some(v) => {
                let t = json_type(v);
                *type_counts.entry(t).or_insert(0) += 1;
                // Collect string/scalar values for top-values.
                if let Some(s) = scalar_to_string(v) {
                    str_values.push(s);
                }
            }
        }
    }

    let null_pct = null_n as f64 / sample_n as f64;

    // Dominant type.
    let inferred_type = type_counts
        .iter()
        .max_by_key(|(_, c)| *c)
        .map(|(t, _)| t.to_string())
        .unwrap_or_else(|| "text".to_string());

    let distinct_n = {
        let mut s = std::collections::HashSet::new();
        for v in &str_values { s.insert(v.as_str()); }
        s.len()
    };
    let unique_pct = if sample_n > 0 {
        distinct_n as f64 / sample_n as f64
    } else {
        0.0
    };

    // Top values.
    let top_values = if unique_pct < 0.95 && !str_values.is_empty() {
        let mut counts: HashMap<&str, i64> = HashMap::new();
        for v in &str_values { *counts.entry(v.as_str()).or_insert(0) += 1; }
        let mut sorted: Vec<_> = counts.into_iter().collect();
        sorted.sort_by(|a, b| b.1.cmp(&a.1));
        sorted
            .into_iter()
            .take(TOP_VALUES_LIMIT)
            .map(|(v, c)| TopValueRaw { value: v.to_string(), count: c })
            .collect()
    } else {
        vec![]
    };

    AdapterAttributeResult {
        name: key.to_string(),
        inferred_type,
        is_nullable: null_n > 0,
        is_pk: false,
        null_pct,
        unique_pct,
        min_value: None,
        max_value: None,
        top_values,
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn json_type(v: &Value) -> &'static str {
    match v {
        Value::Bool(_) => "boolean",
        Value::Number(n) => if n.is_f64() { "real" } else { "integer" },
        Value::String(_) => "text",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
        Value::Null => "null",
    }
}

fn scalar_to_string(v: &Value) -> Option<String> {
    match v {
        Value::Bool(b) => Some(b.to_string()),
        Value::Number(n) => Some(n.to_string()),
        Value::String(s) => Some(s.clone()),
        _ => None,
    }
}

fn file_stem(path: &str) -> String {
    std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string()
}

#[allow(unused)]
fn _use_fk(_: AdapterDeclaredFk) {}
