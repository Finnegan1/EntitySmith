# Phase 3 — Source Profiling Engine

## Goal

When a user registers a structured source (SQLite, CSV, JSON), EntitySmith analyses its
shape and statistics — tables, columns, types, null rates, value distributions, and
declared foreign keys — without modifying the source file. The results are persisted in
the project store and surfaced in the Details Panel.

## What was built

### Adapter layer (`src-tauri/src/adapters/`)

A `SourceAdapter` trait with two methods:

| Method | Purpose |
|---|---|
| `fingerprint()` | Fast `"{size}:{mtime}"` string for cache invalidation |
| `profile()` | Full profiling run; returns `AdapterProfileResult` |

Three concrete adapters:

| Adapter | File | Notes |
|---|---|---|
| `SqliteAdapter` | `sqlite_adapter.rs` | Opens file read-only. Uses `PRAGMA table_info` for column metadata and `PRAGMA foreign_key_list` for declared FKs. Computes stats (null %, unique %, min/max, top-5 values) in a single SQL query per column over a 50 k-row sample. |
| `CsvAdapter` | `csv_adapter.rs` | Uses the `csv` crate. Reads all rows for total count, samples first 10 k for stats. Infers type as integer → real → boolean → text. |
| `JsonAdapter` | `json_adapter.rs` | Supports both JSON arrays of objects and NDJSON. Samples first 1 k objects. Discovers keys across all sample rows. |

`adapter_for(kind, path)` is a factory that returns `None` for non-profilable kinds
(Markdown, PDF, URL) so calling code doesn't need to know which kinds support profiling.

### Storage — Migration 3 (`project_store/mod.rs`)

Four new tables added in `SCHEMA_V3`:

```sql
source_fingerprints  -- one row per profiled source; fingerprint + profiled_at
source_entities      -- one row per table/collection; name + row_count
source_attributes    -- one row per column/field; all stat columns
source_fk_candidates -- declared FKs extracted during SQLite profiling
```

All child tables `ON DELETE CASCADE` from `sources`, so removing a source cleans up
its profile automatically.

`ProjectStore` gains three new public methods:

| Method | Purpose |
|---|---|
| `save_source_profile(source_id, fingerprint, result)` | Replaces any prior profile atomically |
| `get_source_profile_summary(source_id)` | Returns lightweight summary or `None` |
| `get_source_full_profile(source_id)` | Returns full `FullSourceProfile` or `None` |

### IPC commands (`src-tauri/src/commands/profiling.rs`)

| Command | Behaviour |
|---|---|
| `profile_source(sourceId)` | Runs adapter; skips if fingerprint unchanged (cache hit); returns `SourceProfileSummary` |
| `get_source_profile(sourceId)` | Returns full `FullSourceProfile \| null` |
| `get_source_profile_summary(sourceId)` | Returns `SourceProfileSummary \| null` |

### Domain types (`domain/mod.rs`)

Profiling types are intentionally flat (no nested entity/attribute IDs):

- `SourceEntityProfile` — `source_id`, `name`, `row_count`
- `SourceAttributeProfile` — `name`, `inferred_type`, `is_nullable`, `is_pk`, stats, `top_values`
- `TopValue` — `value`, `count`
- `FkCandidate` — `from_entity`, `from_column`, `to_entity`, `to_column`, `is_declared`
- `SourceProfileSummary` — `source_id`, `fingerprint`, `profiled_at`, `entity_count`
- `FullSourceProfile` — `summary` + `entities` + `fk_candidates`

**Why flat?** Phase 5 will promote source entities into schema-graph `EntityType` nodes
with proper UUIDs and provenance. For profiling display we only need stats, not stable
IDs. Adding IDs now would be premature normalisation.

### Frontend

| File | What changed |
|---|---|
| `src/types/index.ts` | Added all profiling TypeScript types mirroring the Rust domain |
| `src/hooks/useSourceProfile.ts` | Hook exposing `profileSource`, `loadProfile`, `profile`, `summary`, `isLoading`, `error` |
| `src/features/sources/ProfilePanel.tsx` | Entity + attribute stats display; FK candidate list |
| `src/app/DetailsPanel.tsx` | Profile section with Profile / Re-profile button; loads existing profile on source selection; renders `ProfilePanel` or loading/empty state |

## Key decisions

### DuckDB deferred to Phase 4+

Adding DuckDB (bundled) would have increased compile time by ~2 minutes and binary size
by ~15 MB for this phase. The native Rust crates (`rusqlite`, `csv`, `serde_json`) give
sufficient profiling for Phase 3. DuckDB will be added in Phase 4 when lazy analytical
export requires it.

### Fingerprint-based caching

The adapter computes a `"{file_size}:{mtime_secs}"` fingerprint before running the full
profile. If the stored fingerprint matches, the existing profile is returned immediately.
This makes repeated invocations (e.g. switching to a source that was already profiled)
instantaneous.

### Source files are never mutated

Adapters open files read-only (`OpenFlags::SQLITE_OPEN_READ_ONLY` for SQLite). No
temporary files are written. This is a core invariant of EntitySmith.

### Top-values threshold (95 %)

If `unique_pct >= 0.95` (e.g. a primary key column), top values are not computed — they
would be meaningless noise. This threshold is consistent across all three adapters.

## Bugs found and fixed during live testing

Testing was performed against the `test_workspace` fixtures (`space_missions.db`, `cities.json`, `launch-vehicles.json`) using the Tauri MCP bridge.

### 1. `<button>` nested inside `<button>` — `SourceRow`

**Symptom:** Row selection highlights were inconsistent; the Profile button in the details panel appeared to not respond to clicks.

**Root cause:** `SourceRow` used `<button>` as the row container, with the remove `<button>` nested inside. This is invalid HTML — browsers eject the inner button from the outer button's DOM subtree, breaking React's event delegation for both elements.

**Fix:** Changed the outer element to `<div role="button" tabIndex={0}>` with explicit `onKeyDown` handling. The remove button remains a real `<button>` and is now a sibling in the DOM rather than a descendant.

### 2. `[ — ]` range display for null min/max values

**Symptom:** JSON sources showed `[ — ]` in the attribute stats even when no range was meaningful (JSON adapter always returns `null` for min/max).

**Root cause:** The guard `attr.minValue !== undefined` passes for JSON `null` (which is distinct from JS `undefined`). React renders `null` as an empty string, producing `[ – ]`.

**Fix:** Changed the guard to `attr.minValue != null` (loose inequality) which catches both `null` and `undefined`.

### 3. JSON "envelope" format not supported

**Symptom:** `launch-vehicles.json` failed profiling with "No JSON objects found in file."

**Root cause:** The file uses a common wrapper pattern: `{ "datasetName": "...", "data": [{...}, ...] }`. The JSON adapter only handled root arrays and NDJSON.

**Fix:** Extended `parse_records()` to handle root-object files: if the root is a JSON object, find the largest property that is an array of objects and use that as the records. Falls back to NDJSON if no such property exists.

## Exit criteria (PLAN.md)

- [x] `profile_source` IPC command runs adapter and persists result
- [x] Fingerprint-based cache: unchanged source returns stored profile immediately
- [x] SQLite adapter: tables, columns, types, null %, unique %, min/max, top-5 values, declared FKs
- [x] CSV adapter: column stats with type inference
- [x] JSON/NDJSON adapter: key discovery + per-key stats
- [x] Profile section visible in Details Panel with Profile / Re-profile button
- [x] `FullSourceProfile` returned by `get_source_profile` includes all entities + FK candidates
