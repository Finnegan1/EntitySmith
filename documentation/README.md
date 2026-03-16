# EntitySmith Documentation

Architecture and design decision records for the EntitySmith Tauri rewrite.
Each file covers a specific area; entries explain not just *what* was built but *why* it was built that way.

## Index

| File | Covers |
|---|---|
| [architecture.md](./architecture.md) | Overall three-layer architecture, guiding principles, and how this differs from the Electron prototype |
| [phase-0-app-shell.md](./phase-0-app-shell.md) | What was done in Phase 0, every non-obvious decision, and what was deliberately deferred |
| [phase-1-project-persistence.md](./phase-1-project-persistence.md) | SQLite project store, migrations, IPC commands, new/open project flow |
| [phase-2-sources.md](./phase-2-sources.md) | Source registration CRUD, kind system, capabilities |
| [phase-3-profiling.md](./phase-3-profiling.md) | Source profiling engine, three adapters, Migration 3, ProfilePanel |
| [phase-4-jobs.md](./phase-4-jobs.md) | Job system, async profile_source, job:update / profile:updated events, JobsIndicator |
| [phase-5-proposals.md](./phase-5-proposals.md) | Stage 3 candidate graph generation: FK detection, soft FK, cross-source name/value heuristics, ProposalsView |
| [tooling.md](./tooling.md) | shadcn + Tailwind v4 setup, path aliases, Vite/Tauri integration |

## Electron prototype reference

The Electron app in `apps/electron` remains as a reference implementation for UI patterns and test fixtures.
It is **not** the architecture target. When the docs here and the Electron app disagree, these docs win.
