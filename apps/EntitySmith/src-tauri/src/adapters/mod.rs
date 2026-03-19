pub mod csv_adapter;
pub mod json_adapter;
pub mod sqlite_adapter;

use crate::domain::SourceKind;

// ── Adapter result types (internal, not IPC-serialised) ───────────────────────

pub struct AdapterProfileResult {
    pub entities: Vec<AdapterEntityResult>,
}

pub struct AdapterEntityResult {
    pub name: String,
    pub row_count: i64,
    pub attributes: Vec<AdapterAttributeResult>,
    pub declared_fks: Vec<AdapterDeclaredFk>,
}

pub struct AdapterAttributeResult {
    pub name: String,
    pub inferred_type: String,
    pub is_nullable: bool,
    pub is_pk: bool,
    pub null_pct: f64,
    pub unique_pct: f64,
    pub min_value: Option<String>,
    pub max_value: Option<String>,
    pub top_values: Vec<TopValueRaw>,
}

pub struct TopValueRaw {
    pub value: String,
    pub count: i64,
}

pub struct AdapterDeclaredFk {
    pub from_column: String,
    pub to_table: String,
    pub to_column: String,
}

// ── Trait ─────────────────────────────────────────────────────────────────────

pub trait SourceAdapter {
    /// Fast fingerprint for cache invalidation — file size + mtime for files,
    /// connection string hash for remote sources.
    fn fingerprint(&self) -> Result<String, String>;

    /// Run full profiling and return raw results to be persisted.
    fn profile(&self) -> Result<AdapterProfileResult, String>;

    /// Return a sample of rows from a specific entity (table / file).
    /// Each row is a map of column name → string value.
    fn sample_rows(
        &self,
        entity_name: &str,
        limit: usize,
    ) -> Result<Vec<std::collections::HashMap<String, Option<String>>>, String>;
}

// ── Factory function ──────────────────────────────────────────────────────────

/// Returns the appropriate adapter for a given source kind and path, or `None`
/// if the source kind does not support profiling.
pub fn adapter_for(
    kind: &SourceKind,
    path: Option<&str>,
) -> Result<Option<Box<dyn SourceAdapter>>, String> {
    let p = match path {
        Some(p) => p,
        None => return Ok(None),
    };

    match kind {
        SourceKind::SqliteFile => Ok(Some(Box::new(
            sqlite_adapter::SqliteAdapter::new(p),
        ))),
        SourceKind::CsvFile => Ok(Some(Box::new(
            csv_adapter::CsvAdapter::new(p),
        ))),
        SourceKind::JsonFile => Ok(Some(Box::new(
            json_adapter::JsonAdapter::new(p),
        ))),
        _ => Ok(None),
    }
}
