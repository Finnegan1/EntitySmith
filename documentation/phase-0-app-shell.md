# Phase 0: App Shell

**Goal:** Replace the Tauri template with a real application shell and establish conventions that survive the full rewrite.

---

## What was built

### Rust side

- The `greet` template command was removed and replaced with `ping`, which returns `{status, version}`.
- Seven Rust modules were scaffolded: `commands`, `domain`, `project_store`, `adapters`, `jobs`, `proposals`, `export`.
- The full domain model (`ProjectState`, `SourceDescriptor`, `EntityType`, `Relationship`, `Proposal`, `JobStatus`, `ProvenanceRecord`, `ValidationIssue`, and supporting enums) was defined in `domain/mod.rs` ahead of Phase 1 implementation.

### Frontend side

- The template `App.tsx` and `App.css` were replaced with a real multi-pane shell.
- A `types/index.ts` file defines all domain types in TypeScript, mirroring the Rust domain model.
- A `hooks/usePing.ts` hook calls the `ping` IPC command on mount to confirm backend connectivity.
- Five feature stubs were created under `src/features/` — one per domain area.

---

## Non-obvious decisions

### Why `ping` instead of just deleting `greet`?

`ping` is not a placeholder — it serves a real purpose at runtime. The `StatusBar` component calls it on startup to confirm the Tauri backend is reachable and to display the app version. This gives an early, visible signal if the IPC bridge is broken. In Tauri development with the MCP bridge enabled, it also confirms the bridge is initialised correctly.

### Why define the domain model in Phase 0, before any storage exists?

Two reasons:

1. **Naming convention lock-in.** The names chosen for domain concepts (e.g. `SourceDescriptor` not `DataSource`, `Proposal` not `Suggestion`, `ProvenanceRecord` not `AuditLog`) propagate everywhere: IPC command signatures, SQLite column names, TypeScript types, UI labels. Fixing them later is expensive. Defining them once, upfront, makes Phase 1 faster and avoids churn.

2. **Frontend types needed immediately.** The shell components use `AppView`, `JobState`, and others from `src/types/index.ts` right now. Having the full type file means no placeholder types that get replaced.

### Why no React Router?

The app uses a simple `useState<AppView>` in `AppShell` to control which view is active. A router (React Router, TanStack Router) adds complexity without adding value at this stage:

- There is no URL bar in a desktop Tauri app, so deep-linking via URL is irrelevant.
- History/back-forward navigation is not a first-class concern yet.
- A `useState` approach is trivially replaced by a router later if needed.

This may change when the schema graph canvas and nested detail views need their own URL-like state.

### Why is the DetailsPanel hidden when no project is open?

The details panel is only visible when a project is open (`projectName !== null`). An empty details panel with no project context is misleading — it implies there is something to inspect. Hiding it keeps the welcome screen clean and makes the three-panel layout feel purposeful rather than cluttered.

### Why does `WorkspaceArea` own both the welcome screen and the per-view empty states?

Keeping both in one component avoids an extra routing/conditional layer in `AppShell`. The welcome screen and the empty states are both "no content yet" UI — they just differ on whether a project is open. A single component that branches on `projectName` is the simplest shape.

### Why is `AppShell.tsx` the place where project state lives?

Currently, `projectName` is the only project state. It lives in `AppShell` because:

- It needs to be shared across Sidebar (project name display), WorkspaceArea (welcome vs content), and StatusBar (project name in status bar).
- It is view-layer state, not domain state — the Rust backend will be the authoritative source.

In Phase 1, this will be replaced with a proper `useProject` hook that calls IPC commands and caches the result. The structure of `AppShell` does not need to change when that happens — only the source of `projectName`.

---

## What was explicitly deferred

| Thing | Why deferred | Phase |
|---|---|---|
| React Router | No URL bar in a desktop app; `useState` is sufficient now | Phase 5+ |
| Dark mode toggle | CSS variables and `.dark` class are already wired; just needs a UI control | Phase 1 |
| Window title bar customisation | Default Tauri chrome is fine for now | Phase 1 |
| Real `New Project` / `Open Project` flow | Needs file picker IPC and SQLite backend | Phase 1 |
| `ts-rs` / `specta` for type codegen | Manually synced types are fine until the surface grows | Phase 3+ |
| Resizable panels | Fixed-width sidebar/details are fine until content is real | Phase 5 |

---

## Exit criteria met

- The Tauri app launches with a real shell, not the template. ✓
- The project compiles cleanly in both frontend (TypeScript + Vite) and Rust (`cargo check`). ✓
- The repository has a documented module structure with explicit naming conventions. ✓
- The `greet` command is gone; `ping` is the IPC baseline. ✓
