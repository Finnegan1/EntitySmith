use rusqlite::{Connection, OpenFlags, params};
use std::collections::HashMap;
use std::time::UNIX_EPOCH;

use super::{
    AdapterAttributeResult, AdapterDeclaredFk, AdapterEntityResult,
    AdapterProfileResult, SourceAdapter, TopValueRaw,
};

/// Maximum rows used when computing per-column statistics.
const SAMPLE_ROWS: i64 = 50_000;
/// Maximum number of top-value entries to store per column.
const TOP_VALUES_LIMIT: i64 = 5;
/// Columns with more than this fraction of unique values won't have top-values
/// computed (too many distinct values for a frequency histogram to be useful).
const TOP_VALUES_UNIQUE_THRESHOLD: f64 = 0.95;

pub struct SqliteAdapter {
    path: String,
}

impl SqliteAdapter {
    pub fn new(path: &str) -> Self {
        Self { path: path.to_string() }
    }
}

impl SourceAdapter for SqliteAdapter {
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
        let conn = Connection::open_with_flags(
            &self.path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| format!("Cannot open SQLite file: {e}"))?;

        // List all user tables (exclude sqlite_ internals).
        let tables: Vec<String> = {
            let mut stmt = conn
                .prepare(
                    "SELECT name FROM sqlite_master
                     WHERE type = 'table'
                       AND name NOT LIKE 'sqlite_%'
                     ORDER BY name",
                )
                .map_err(|e| format!("Cannot list tables: {e}"))?;
            let rows: Vec<String> = stmt.query_map([], |row| row.get(0))
                .map_err(|e| format!("Cannot read table list: {e}"))?
                .filter_map(|r| r.ok())
                .collect();
            rows
        };

        let entities = tables
            .iter()
            .map(|t| profile_table(&conn, t))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(AdapterProfileResult { entities })
    }

    fn sample_rows(
        &self,
        entity_name: &str,
        limit: usize,
    ) -> Result<Vec<HashMap<String, Option<String>>>, String> {
        let conn = Connection::open_with_flags(
            &self.path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| format!("Cannot open SQLite file: {e}"))?;

        let q_table = qi(entity_name);
        let sql = format!("SELECT * FROM {q_table} LIMIT {limit}");
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("Cannot prepare sample query: {e}"))?;

        let col_names: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|c| c.to_string())
            .collect();

        let rows = stmt
            .query_map([], |row| {
                let mut map = HashMap::new();
                for (i, name) in col_names.iter().enumerate() {
                    let val: Option<String> = row
                        .get::<_, rusqlite::types::Value>(i)
                        .ok()
                        .and_then(|v| match v {
                            rusqlite::types::Value::Null => None,
                            rusqlite::types::Value::Integer(n) => Some(n.to_string()),
                            rusqlite::types::Value::Real(n) => Some(n.to_string()),
                            rusqlite::types::Value::Text(s) => Some(s),
                            rusqlite::types::Value::Blob(_) => Some("[blob]".to_string()),
                        });
                    map.insert(name.clone(), val);
                }
                Ok(map)
            })
            .map_err(|e| format!("Cannot read sample rows: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    }
}

// ── Per-table profiling ───────────────────────────────────────────────────────

fn profile_table(conn: &Connection, table: &str) -> Result<AdapterEntityResult, String> {
    let q_table = qi(table);

    // Total row count.
    let row_count: i64 = conn
        .query_row(&format!("SELECT COUNT(*) FROM {q_table}"), [], |r| r.get(0))
        .map_err(|e| format!("COUNT(*) on {table}: {e}"))?;

    let sample_size = row_count.min(SAMPLE_ROWS);

    // Column metadata via PRAGMA.
    let cols = get_column_info(conn, table)?;

    // Declared FKs via PRAGMA.
    let declared_fks = get_fk_list(conn, table)?;

    let attributes = cols
        .iter()
        .map(|c| profile_column(conn, table, c, sample_size, row_count))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(AdapterEntityResult {
        name: table.to_string(),
        row_count,
        attributes,
        declared_fks,
    })
}

// ── Per-column profiling ──────────────────────────────────────────────────────

struct ColInfo {
    name: String,
    declared_type: String,
    not_null: bool,
    is_pk: bool,
}

fn profile_column(
    conn: &Connection,
    table: &str,
    col: &ColInfo,
    sample_size: i64,
    row_count: i64,
) -> Result<AdapterAttributeResult, String> {
    let q_table = qi(table);
    let q_col = qi(&col.name);

    // One query: sample_n / null_n / distinct_n.
    let (sample_n, null_n, distinct_n): (i64, i64, i64) = conn
        .query_row(
            &format!(
                "SELECT COUNT(*),
                        SUM(CASE WHEN {q_col} IS NULL THEN 1 ELSE 0 END),
                        COUNT(DISTINCT {q_col})
                 FROM (SELECT {q_col} FROM {q_table} LIMIT {sample_size})"
            ),
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| format!("Stats for {}.{}: {e}", table, col.name))?;

    let null_pct = if sample_n > 0 { null_n as f64 / sample_n as f64 } else { 0.0 };
    let unique_pct = if sample_n > 0 { distinct_n as f64 / sample_n as f64 } else { 0.0 };

    // Min/max (skip for high-cardinality or all-null columns).
    let (min_value, max_value) = if sample_n > 0 && null_n < sample_n {
        conn.query_row(
            &format!(
                "SELECT CAST(MIN({q_col}) AS TEXT), CAST(MAX({q_col}) AS TEXT)
                 FROM (SELECT {q_col} FROM {q_table} LIMIT {sample_size})"
            ),
            [],
            |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .unwrap_or((None, None))
    } else {
        (None, None)
    };

    // Top values (skip when almost every value is unique — e.g. PKs).
    let top_values = if unique_pct < TOP_VALUES_UNIQUE_THRESHOLD && sample_n > 0 {
        conn.prepare(&format!(
            "SELECT CAST({q_col} AS TEXT) as v, COUNT(*) as n
             FROM (SELECT {q_col} FROM {q_table} LIMIT {sample_size})
             WHERE {q_col} IS NOT NULL
             GROUP BY {q_col}
             ORDER BY n DESC
             LIMIT {TOP_VALUES_LIMIT}"
        ))
        .and_then(|mut stmt| {
            stmt.query_map([], |r| {
                Ok(TopValueRaw {
                    value: r.get::<_, String>(0).unwrap_or_default(),
                    count: r.get(1)?,
                })
            })
            .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
        })
        .unwrap_or_default()
    } else {
        vec![]
    };

    // Scale null_pct to the full table if row_count > sample.
    let null_pct_scaled = if row_count > sample_size && sample_n > 0 {
        null_pct // sample is a good estimate
    } else {
        null_pct
    };

    Ok(AdapterAttributeResult {
        name: col.name.clone(),
        inferred_type: normalise_sqlite_type(&col.declared_type),
        is_nullable: !col.not_null,
        is_pk: col.is_pk,
        null_pct: null_pct_scaled,
        unique_pct,
        min_value,
        max_value,
        top_values,
    })
}

// ── PRAGMA helpers ────────────────────────────────────────────────────────────

fn get_column_info(conn: &Connection, table: &str) -> Result<Vec<ColInfo>, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({})", qi(table)))
        .map_err(|e| format!("PRAGMA table_info({table}): {e}"))?;

    let cols = stmt
        .query_map([], |r| {
            Ok(ColInfo {
                name: r.get::<_, String>(1)?,
                declared_type: r.get::<_, String>(2)?,
                not_null: r.get::<_, i32>(3)? != 0,
                is_pk: r.get::<_, i32>(5)? != 0,
            })
        })
        .map_err(|e| format!("Reading column info for {table}: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(cols)
}

fn get_fk_list(conn: &Connection, table: &str) -> Result<Vec<AdapterDeclaredFk>, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA foreign_key_list({})", qi(table)))
        .map_err(|e| format!("PRAGMA foreign_key_list({table}): {e}"))?;

    let fks = stmt
        .query_map([], |r| {
            Ok(AdapterDeclaredFk {
                from_column: r.get::<_, String>(3)?,
                to_table: r.get::<_, String>(2)?,
                to_column: r.get::<_, String>(4)?,
            })
        })
        .map_err(|e| format!("Reading FKs for {table}: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(fks)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Quote an SQLite identifier with double quotes, escaping embedded quotes.
fn qi(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Map SQLite declared column types to canonical type strings.
fn normalise_sqlite_type(t: &str) -> String {
    let up = t.to_uppercase();
    if up.contains("INT") {
        "integer".to_string()
    } else if up.contains("REAL") || up.contains("FLOA") || up.contains("DOUB") {
        "real".to_string()
    } else if up.contains("TEXT") || up.contains("CHAR") || up.contains("CLOB") {
        "text".to_string()
    } else if up.contains("BLOB") || up.is_empty() {
        "blob".to_string()
    } else if up.contains("BOOL") {
        "boolean".to_string()
    } else if up.contains("DATE") || up.contains("TIME") {
        "datetime".to_string()
    } else if up.contains("NUM") || up.contains("DEC") {
        "numeric".to_string()
    } else {
        t.to_lowercase()
    }
}

// Suppress unused-import warning when params is pulled from a parent module.
#[allow(unused_imports)]
use params as _;
