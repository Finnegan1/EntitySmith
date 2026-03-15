# Phase 1: Domain Model and Project Persistence

**Goal:** A real persisted project file. The user can create a new `.entitysmith` project or open an existing one. State survives restarts.

---

## What was built

### Rust

- **`project_store/mod.rs`** — `ProjectStore` wrapping a `rusqlite::Connection`, with `create()`, `open()`, `get_project_state()`, `log_change()`, and `validate_project_name()`.
- **`commands/project.rs`** — four IPC commands: `create_project`, `open_project`, `close_project`, `get_project_state`.
- **`domain/mod.rs`** — added `#[serde(rename_all = "camelCase")]` to all IPC-boundary structs so field names match the TypeScript types (`projectId` not `project_id`).
- **`lib.rs`** — added `AppState` with `Mutex<Option<ProjectStore>>`, registered `tauri_plugin_dialog`, registered all four new commands.

### Frontend

- **`hooks/useProject.ts`** — manages project IPC: `createProject`, `openProject`, `closeProject`, local `isLoading` / `error` state.
- **`app/NewProjectModal.tsx`** — shadcn Dialog with name input + directory picker.
- **`app/AppShell.tsx`** — replaced stub handlers with real IPC via `useProject`; modal lifecycle driven by `project` state.
- Added `@tauri-apps/plugin-dialog`, shadcn `dialog`, `input`, `label` components.

### Config

- `Cargo.toml` — added `rusqlite` (bundled), `uuid` (v4), `chrono` (serde), `tauri-plugin-dialog`.
- `capabilities/default.json` — added `dialog:allow-open`, `dialog:allow-save`.
- `tauri.conf.json` — window size 1280×800, min 960×600.

---

## SQLite schema (migration 1)

```sql
-- Schema version tracker.
-- Bootstrapped with version=0 on brand-new files so the migration runner
-- can detect whether migration 1 has been applied.
CREATE TABLE IF NOT EXISTS _meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

-- One row per project file (always exactly one row).
CREATE TABLE IF NOT EXISTS project (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL,
    version    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,  -- RFC 3339 UTC
    updated_at TEXT NOT NULL   -- RFC 3339 UTC
);

-- Append-only audit trail. Every mutating command writes one row.
-- Enables undo/redo (dispatcher not yet implemented — Phase 5+).
CREATE TABLE IF NOT EXISTS change_log (
    id              TEXT PRIMARY KEY NOT NULL,
    sequence        INTEGER NOT NULL,        -- monotonic, manually computed
    operation       TEXT NOT NULL,           -- e.g. "create_project"
    object_kind     TEXT NOT NULL,           -- e.g. "project"
    object_id       TEXT NOT NULL,
    forward_payload TEXT NOT NULL,           -- JSON: the new state
    reverse_payload TEXT NOT NULL,           -- JSON: how to undo ({} if irreversible)
    created_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS change_log_sequence ON change_log(sequence);
```

---

## Non-obvious decisions

### Why `rusqlite` with `features = ["bundled"]`?

Bundled compiles SQLite from source rather than linking the system library. This avoids SQLite version divergence across macOS, Windows, and Linux — different OS versions ship different SQLite minor versions, and some features (e.g. WAL mode, specific pragmas) vary. Bundling adds compile time but eliminates a class of hard-to-diagnose runtime failures.

### Why `std::sync::Mutex` and not `tokio::sync::Mutex`?

Tauri 2 async commands run on Tokio's thread pool. It is generally unsafe to hold a `std::Mutex` lock across an `.await` point because it blocks a thread. However, these command handlers never hold the lock across `.await` — every lock acquisition is followed immediately by a synchronous SQLite call, then the lock is released before any `await`. `std::Mutex` is therefore correct and cheaper. If a future phase introduces long-running async work that needs project state, switch to `tokio::sync::Mutex` at that point.

### Why is `sequence` manually computed rather than using SQLite ROWID?

`ROWID` is an implementation detail that can be reassigned after `VACUUM` and is not guaranteed monotonic in all edge cases. A manually computed `MAX(sequence) + 1` inside the same connection gives a deterministic, portable, gap-free event sequence that is straightforward to reason about when implementing undo/redo traversal later.

### Why `#[serde(rename_all = "camelCase")]` on Rust structs?

The frontend's `src/types/index.ts` uses camelCase field names (`projectId`, `createdAt`) to match TypeScript conventions. Without the rename attribute, serde would serialize Rust's `project_id` as-is, the TypeScript types would silently not match, and the values would be `undefined` at runtime with no compiler error.

### New project flow: name input → directory picker (not a save dialog)

Using `save()` dialog would require the user to type the full filename including the `.entitysmith` extension, which is worse UX. The chosen approach separates concerns: the name is a display name (validated for illegal filename characters), the directory is a folder. The filename is constructed as `{dir}/{name}.entitysmith` on the Rust side where validation also happens.

### `validate_project_name` lives in Rust, not the frontend

The project name becomes part of the filesystem path. Validating it only in TypeScript is insufficient because the IPC surface is callable from any context. Rust validates before touching the filesystem and returns a descriptive error string that surfaces in the modal.

### The modal does not close itself on success

`NewProjectModal` calls `onConfirm` and waits. It does not know whether the call succeeded — that information lives in `AppShell` (which watches `project` state). `AppShell` closes the modal in a `useEffect` when `project !== null`. This keeps the modal stateless about IPC outcomes and avoids tangled prop callbacks.

---

## Deferred from Phase 1

| Thing | Why deferred | Phase |
|---|---|---|
| Recent projects list | Needs a separate app-level preferences store outside the project file | Phase 2 |
| App-launch crash recovery (`get_project_state` on cold start) | No persistent project path stored between sessions yet | Phase 2 |
| Undo/redo dispatcher | `change_log` schema is in place; UI and command replay logic are Phase 5+ | Phase 5+ |
| Project rename / move | Low value until more content exists | Phase 2 |

---

## Exit criteria met

- User can create a new project file (name + directory dialog). ✓
- User can open an existing `.entitysmith` file (file picker). ✓
- Project state round-trips correctly (SQLite persists across process restarts). ✓
- Schema migrations are in place (version-tracked, idempotent). ✓
- Change log entries are written for `create_project`. ✓
- Both Rust (`cargo check`) and frontend (`tsc && vite build`) compile clean. ✓
