# EntitySmith Documentation

Architecture and design decision records for the EntitySmith Tauri rewrite.
Each file covers a specific area; entries explain not just *what* was built but *why* it was built that way.

## Index

| File | Covers |
|---|---|
| [architecture.md](./architecture.md) | Overall three-layer architecture, guiding principles, and how this differs from the Electron prototype |
| [phase-0-app-shell.md](./phase-0-app-shell.md) | What was done in Phase 0, every non-obvious decision, and what was deliberately deferred |
| [phase-1-project-persistence.md](./phase-1-project-persistence.md) | SQLite project store, migrations, IPC commands, new/open project flow |
| [tooling.md](./tooling.md) | shadcn + Tailwind v4 setup, path aliases, Vite/Tauri integration |

## Electron prototype reference

The Electron app in `apps/electron` remains as a reference implementation for UI patterns and test fixtures.
It is **not** the architecture target. When the docs here and the Electron app disagree, these docs win.
