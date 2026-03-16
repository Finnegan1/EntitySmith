# Phase 6 — Schema Graph Core + Stage 4 Entity Catalog

## Goal

Implement the canonical schema graph layer: entity types, relationships, and source-entity bindings.
Users can build a graph of entity types (e.g. `Customer`, `Order`) by promoting source entities from the
Entity Catalog or by creating types manually, then connecting them with typed relationship edges.

---

## Deliverables

| Area | What was built |
|---|---|
| Backend: Migration 5 | `entity_types`, `entity_source_bindings`, `relationships` tables |
| Backend: ProjectStore | 9 new CRUD methods (see below) |
| Backend: IPC commands | `commands/schema_graph.rs` — 9 commands |
| Frontend: types | `EntitySourceBinding`, `EntityTypeWithBindings`, `SchemaGraph`, `SourceEntitySummary` |
| Frontend: hook | `useSchemaGraph` — loads graph + source entities, reacts to `schema:updated` |
| Frontend: canvas | `SchemaGraphCanvas` — ReactFlow canvas with custom `EntityTypeNode` nodes |
| Frontend: catalog | `EntityCatalogView` — source entity table with binding actions |
| Frontend: view | `SchemaGraphView` — combined canvas/catalog with tab bar |
| Frontend: wiring | `WorkspaceArea`, `AppShell`, `DetailsPanel` updated |

---

## Architecture

### Three-table schema (Migration 5)

```
entity_types
  id, project_id, name, label, description, created_at

entity_source_bindings
  id, entity_type_id, source_id, entity_name, created_at
  UNIQUE (entity_type_id, source_id, entity_name)

relationships
  id, project_id, source_entity_type_id, target_entity_type_id,
  predicate, cardinality, created_at
```

**Why this structure:**
- `entity_types` are canonical — they persist across source changes and are the nodes in the exported graph.
- `entity_source_bindings` record *which source-local entity maps to which canonical type*. One canonical type
  can be bound to entities from multiple sources (the MERGE use case). One source entity maps to at most one
  canonical type at a time.
- `relationships` are edges between canonical types, independent of the source-level FK candidates.

### Stage 3 → Stage 4 handoff

Stage 3 proposals reference source-local entities (`from_source_id + from_entity`). `promote_proposal` performs
the full handoff atomically:

1. Look up the proposal
2. `get_or_create` entity type for `from_entity`
3. `get_or_create` entity type for `to_entity`
4. Create the relationship using the effective predicate/cardinality
5. Bind `from_source_id/from_entity → from entity type`
6. Bind `to_source_id/to_entity → to entity type`
7. Mark the proposal `accepted`
8. Emit `schema:updated` + `proposals:updated`

If entity types with those names already exist (e.g. from a previous promote or manual creation), they are
reused — deduplication is by `(project_id, name)` unique index.

### `list_source_entities_summary` — the Entity Catalog query

Joins `source_entities → sources → entity_source_bindings? → entity_types?` and aggregates proposal stats
(count + max confidence) per `(source_id, entity_name)` from both the `from_*` and `to_*` sides of proposals.
This gives the catalog table everything it needs in one round-trip.

---

## Key design decisions

### Why not derive entity types automatically from proposal acceptance?

Manual `review_proposal` (accept/reject) is decoupled from entity type creation by design. A user reviewing
proposals in the Stage 3 UI is making a *connection decision*, not a *type promotion decision*. Stage 4
explicitly lets the user decide which source entities to elevate into the canonical graph. `promote_proposal`
is the bridge when they want to do both at once.

### `EntitySourceBinding` uniqueness

The unique index `(entity_type_id, source_id, entity_name)` prevents double-binding. `bind_source_entity`
uses `INSERT OR IGNORE` so re-binding is a no-op rather than an error.

### ReactFlow canvas layout

Phase 6 uses a simple 3-column grid layout. Positions are not persisted — they are recomputed from the
entity type list each render. Node drag is enabled via `onNodesChange` but positions are lost on reload.
Persisting positions is deferred to a future phase when the graph is larger and layout matters more.

### `schema:updated` event

All mutating commands (`create_entity_type`, `delete_entity_type`, `add_relationship`, `delete_relationship`,
`bind_source_entity`, `unbind_source_entity`, `promote_proposal`) emit `schema:updated`. The `useSchemaGraph`
hook subscribes to this event and reloads both the graph and the source entity summary on every update,
keeping all open views in sync without manual refreshes.

---

## Files changed

### Backend

| File | Change |
|---|---|
| `src-tauri/src/domain/mod.rs` | Added `EntitySourceBinding`, `EntityTypeWithBindings`, `SchemaGraph`, `SourceEntitySummary` |
| `src-tauri/src/project_store/mod.rs` | `SCHEMA_V5`, version bump to 5, 9 new methods |
| `src-tauri/src/commands/schema_graph.rs` | New — 9 IPC commands |
| `src-tauri/src/commands/mod.rs` | `pub mod schema_graph` |
| `src-tauri/src/lib.rs` | Registered 9 commands in invoke_handler |

### Frontend

| File | Change |
|---|---|
| `src/types/index.ts` | Added 4 new interfaces |
| `src/hooks/useSchemaGraph.ts` | New — schema graph state + actions + event listener |
| `src/features/schema-graph/EntityTypeNode.tsx` | New — custom ReactFlow node |
| `src/features/schema-graph/SchemaGraphCanvas.tsx` | New — ReactFlow canvas |
| `src/features/schema-graph/EntityCatalogView.tsx` | New — source entity catalog table |
| `src/features/schema-graph/SchemaGraphView.tsx` | New — combined view with tab bar |
| `src/features/schema-graph/index.ts` | New — re-exports |
| `src/app/WorkspaceArea.tsx` | Added schema-graph route |
| `src/app/AppShell.tsx` | Added `selectedEntityType` state |
| `src/app/DetailsPanel.tsx` | Added `EntityTypeDetail` component |

---

## What is deliberately deferred

- **Persisting canvas node positions** — grid layout is fine for small graphs; save/restore deferred.
- **Consolidation proposals (MERGE/LINK/SUBTYPE)** — Stage 4 in BRAINSTORM.md; the entity catalog and bindings system is the foundation, but the similarity-score-driven consolidation workflow (auto-suggesting which source entities should merge) is a future phase.
- **Relationship editor UI** — currently relationships are created by dragging between nodes on the canvas (default predicate `relatedTo`). A proper edge editor (custom predicate, cardinality picker) is deferred.
- **Entity type rename / edit** — entity types can be created and deleted but not renamed yet.
