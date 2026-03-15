# EntitySmith Architecture

## The core problem with the Electron prototype

The Electron app has a working UI but its state management mixes concerns that need to be separated:

- Source metadata, profile results, and schema graph state all live inside React context and component state.
- There is no durable project file — reopening the app means starting over.
- Business logic (proposal generation, profiling, export) runs in the renderer process, which is not the right place for it: it shares memory with the UI, blocks on CPU work, and is hard to test in isolation.

The Tauri rewrite does not port these patterns. It inverts the model.

---

## The three layers

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend  (apps/EntitySmith/src)                           │
│  React 19 + TypeScript + shadcn/ui + Tailwind CSS 4         │
│  Responsible for: rendering, user interaction, view state   │
│  NOT responsible for: business logic, data processing       │
├─────────────────────────────────────────────────────────────┤
│  Backend  (apps/EntitySmith/src-tauri/src)                  │
│  Rust + Tauri 2 IPC                                         │
│  Responsible for: all domain logic, data processing, jobs   │
│  Communicates with frontend via typed IPC commands/events   │
├─────────────────────────────────────────────────────────────┤
│  Storage  (src-tauri, via rusqlite + DuckDB)                │
│  SQLite: durable project state (.entitysmith file)          │
│  DuckDB: analytical queries over source data                │
│  Source files: always read-only, never mutated              │
└─────────────────────────────────────────────────────────────┘
```

### Why Rust for the backend?

The two main drivers are performance and correctness:

- Profiling large CSV/SQLite files and computing statistics needs to run off the UI thread. Rust + DuckDB handles this well.
- The domain model (proposals, provenance, conflict policies) has enough invariants that a typed, compiled language makes bugs significantly harder to introduce than JS/TS would.
- Tauri's IPC is a natural boundary: the frontend never directly reads files or queries databases. Everything goes through a command.

### Why SQLite for project state?

The `.entitysmith` project file is a SQLite database, not JSON or a proprietary binary:

- It is a single portable file the user can copy, email, or version-control.
- SQLite supports transactions, which makes undo/redo semantics tractable.
- It can be opened with any SQLite browser for debugging without custom tooling.
- The schema can be migrated across versions with standard `ALTER TABLE` / migration scripts.

### Why DuckDB for analytical queries?

Source profiling (null %, cardinality, top values, value distributions) is analytical by nature. DuckDB can query CSV, Parquet, and JSON files directly without loading them into memory, and runs these queries an order of magnitude faster than row-by-row Rust iteration would.

Source files are never imported into DuckDB permanently — they are queried on demand.

---

## Rust module structure

Each module maps roughly to a delivery phase so the codebase grows in a predictable direction:

```
src-tauri/src/
├── commands/          # Tauri IPC command handlers — thin, delegate to domain modules
│   └── system.rs      # ping (Phase 0), project open/create (Phase 1), ...
├── domain/            # Core types: ProjectState, EntityType, Proposal, etc.
├── project_store/     # SQLite persistence, migrations, change log (Phase 1)
├── adapters/          # Source-specific readers: SQLite, JSON, CSV, ... (Phase 2/3)
├── jobs/              # Background job lifecycle, cancellation, events (Phase 4)
├── proposals/         # Proposal generation and review engine (Phase 6)
└── export/            # Validation, format serialization, streaming export (Phase 9)
```

**Commands are intentionally thin.** A command handler should validate inputs, call a domain function, and return a result. Business logic belongs in the domain modules, not in command handlers.

---

## Frontend module structure

```
src/
├── app/               # Shell: AppShell, Sidebar, WorkspaceArea, DetailsPanel, StatusBar
├── features/          # One folder per domain area (sources, schema-graph, proposals, ...)
│   └── {feature}/     # Each feature owns its own components, hooks, and local types
├── components/        # Shared/generic UI components (shadcn output lands here)
│   └── ui/
├── hooks/             # Cross-feature hooks (usePing, useProject, ...)
├── lib/               # Utilities (cn, formatters, ...)
└── types/             # Canonical domain type definitions (mirrors Rust domain module)
```

### Principle: frontend is display logic only

The frontend should not hold business logic. It:
- Issues IPC commands and displays results
- Manages view state (which panel is open, what is selected)
- Shows optimistic updates where appropriate
- Does NOT compute profiling results, generate proposals, or resolve conflicts

If you find yourself putting business logic into a React component or hook, it belongs in Rust instead.

### Domain types are duplicated by design (for now)

`src/types/index.ts` mirrors `src-tauri/src/domain/mod.rs`. This is intentional:

- There is no code-generation step from Rust types to TypeScript yet. Adding one is a future concern.
- The duplication is bounded to one file on each side.
- Keeping them manually in sync is the cost we pay to avoid build-step complexity in Phase 0.

A future phase may introduce `ts-rs` or `specta` to generate the TypeScript types from Rust automatically.

---

## Guiding principles

These come from `BRAINSTORM.md` and shape every architectural decision:

1. **Source data is never mutated.** All sources are read-only inputs. The project file stores derived state, not copies of source data.

2. **Non-destructive and auditable.** Every proposal and decision is stored with its origin, evidence, and status. Nothing is deleted silently.

3. **Schema graph ≠ instance data.** The canonical schema (entity types, relationships) is a separate artifact from the instance data in source files. These are never conflated.

4. **Provenance everywhere.** Proposals know where they came from. Accepted decisions know what user action accepted them. Exports carry named-graph provenance when required.

5. **Lazy/analytical processing.** Large source files are never fully loaded into memory. Profiling runs DuckDB queries. Export streams row by row.
