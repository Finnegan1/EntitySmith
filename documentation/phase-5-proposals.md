# Phase 5 — Stage 3: Candidate Graph Generation

## Goal

Implement BRAINSTORM.md Stage 3 end-to-end: generate connection proposals between source entities, let the user review and accept/reject them, and persist every decision with full provenance.

## What "proposals" are in this context

A **connection proposal** is a candidate relationship between two source entities (a table in a SQLite file, a collection in a JSON file, etc.). It says: "these two columns probably link these two entities". The user decides whether to accept, reject, or accept with modifications.

Proposals are distinct from the canonical schema graph (Stage 4). They reference source entities by name and source ID. Stage 4 will remap accepted proposals to canonical entity types after consolidation.

## Detection methods implemented

### 3a-i — Declared FK (confidence 0.95, origin: declared_fk)
`source_fk_candidates` rows with `is_declared = true` become `ProposalKind::ForeignKey` proposals. These are pre-populated during profiling from SQLite `PRAGMA foreign_key_list`. Near-certain relationships.

### 3a-ii — Soft FK, column-name pattern (confidence 0.70, origin: heuristic)
Within each source, columns matching `{entity}_id`, `{entity}_key`, `{entity}Id`, etc. are matched against entities with that name (with simple plural/singular normalisation). If the referenced entity has a PK column, a `ProposalKind::SoftForeignKey` proposal is generated.

### 3b-i — Cross-source column-name similarity (origin: heuristic)
For every cross-source column pair, a cumulative score is computed:
- Exact column name match → +0.40
- Normalized name match (case-insensitive, strip separators) → +0.30
- FK pattern: `col_a` is `{entity_b}_id` and `col_b` is a PK → +0.80
- Jaro-Winkler similarity > 0.85 → up to +0.30
- Both PKs with same inferred type → +0.10

Threshold: cumulative score ≥ 0.40 → `ProposalKind::ColumnNameSimilarity`.

### 3b-ii — Cross-source value overlap (origin: heuristic)
For column pairs where both have stored `top_values` (low-cardinality columns), the fraction of shared values is computed. If > 0.30, the `value_overlap × 0.30` contribution pushes the score up and the kind is upgraded to `ProposalKind::SampleValueOverlap` when value overlap was the primary driver.

### Deferred (Phase 11)
- Embedding similarity (`ProposalKind::EmbeddingSimilarity`)
- LLM reasoning (`ProposalKind::LlmReasoning`)

## Architecture

### Proposal engine (`proposals/mod.rs`)
Pure function: `generate_proposals(project_id, sources: &[SourceData]) -> Vec<Proposal>`. No I/O. Takes pre-loaded profile data, returns proposals deduplicated by (kind, from/to endpoint tuple).

### Command flow
```
generate_proposals_cmd (async IPC)
  → lock project, extract sources + profiles
  → release lock
  → create job, emit job:update {queued}
  → spawn async task
    → set job running, emit job:update {running}
    → spawn_blocking: run engine → save_proposals (new connection)
    → emit job:update {completed}
    → emit proposals:updated
      → useProposals listener reloads list
```

The same two-connection pattern from Phase 4 (profiling) is used: extract data while holding the Mutex, then open a fresh `ProjectStore` connection for writing in the background task.

### Proposal lifecycle
| Status | Meaning |
|---|---|
| `pending` | Generated, not yet reviewed |
| `accepted` | User accepted as-is |
| `modified` | User accepted with changed predicate/cardinality |
| `rejected` | User dismissed |

Re-running "Run Analysis" deletes all `pending` proposals and regenerates. `accepted`/`modified`/`rejected` decisions are preserved.

## Database schema (Migration 4)

```sql
CREATE TABLE proposals (
    id, project_id, kind, status, confidence, origin,
    from_source_id, from_entity, from_column,
    to_source_id, to_entity, to_column,
    suggested_predicate, suggested_cardinality,
    reviewed_predicate, reviewed_cardinality,
    evidence JSON, created_at, updated_at
)
```

Evidence is a JSON blob whose structure depends on `kind`:
- FK: `{is_declared, link_columns: [{from, to}]}`
- Name similarity: `{name_score, fk_pattern_score, jaro_winkler, value_overlap, total_score}`
- Value overlap: same as name similarity (value_overlap > 0.30)

## Frontend

### `useProposals` hook
- Loads proposals via `invoke("list_proposals")` on mount
- Listens for `proposals:updated` event → reloads
- `generateProposals()` → calls `invoke("generate_proposals_cmd")`, sets generating spinner
- `reviewProposal(id, action, predicate?, cardinality?)` → calls `invoke("review_proposal")`, optimistically updates list

### `ProposalsView` component
- Filter tabs: All / Pending / Accepted / Modified / Rejected
- Origin filter: All origins / FK / Heuristic
- Sorted by confidence descending (backend)
- Expandable rows with evidence breakdown
- Inline predicate + cardinality editor in expanded view
- "Save & Accept" (modify action) / "Reject" / collapsed "Accept"/"Reject" quick-actions

## File inventory

| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | Added `strsim = "0.11"` |
| `src-tauri/src/domain/mod.rs` | Extended `Proposal` struct; added `to_db_str`/`from_db_str` to `ProposalKind`, `ProposalStatus`, `ProposalOrigin` |
| `src-tauri/src/project_store/mod.rs` | Migration 4, `save_proposals`, `list_proposals`, `review_proposal` |
| `src-tauri/src/proposals/mod.rs` | Full proposal engine |
| `src-tauri/src/commands/proposals.rs` | `generate_proposals_cmd`, `list_proposals`, `review_proposal` IPC commands |
| `src-tauri/src/commands/mod.rs` | Added `pub mod proposals` |
| `src-tauri/src/lib.rs` | Registered three new commands |
| `src/types/index.ts` | Extended `Proposal` interface, added `ReviewAction` type |
| `src/hooks/useProposals.ts` | New hook |
| `src/features/proposals/ProposalsView.tsx` | New proposals inbox UI |
| `src/app/WorkspaceArea.tsx` | Wired `ProposalsView` into proposals view route |

## Stage 3 → Stage 4 handoff

After the user accepts proposals, Stage 4 (Phase 7 in PLAN.md) will:
1. Promote source entities to canonical entity types
2. Remap accepted proposal endpoints from source entity names to canonical type IDs
3. Flag edges whose both endpoints changed for revalidation

The proposals table is designed to support this: `from_source_id + from_entity` uniquely identifies a source entity, which can later be joined to a canonical entity type mapping table.
