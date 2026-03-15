# EntitySmith

A local-first desktop app for building canonical knowledge graphs from structured and unstructured sources.

Built with Tauri 2, React 19, TypeScript, Rust, and SQLite.

## Development

```sh
# Start Tauri dev mode (Rust backend + Vite frontend)
bun run dev

# Frontend only (no Rust)
bun run dev:vite

# Type-check
bun run build

# Production build
bunx tauri build
```

## Architecture

See [`documentation/architecture.md`](../../documentation/architecture.md) for the full layered architecture and guiding principles.

```
src/                         # React frontend
├── app/                     # Shell: AppShell, Sidebar, WorkspaceArea, DetailsPanel, StatusBar
├── features/                # One folder per domain area
├── components/ui/           # shadcn components
├── hooks/                   # Shared hooks
├── lib/                     # Utilities
└── types/                   # Domain type definitions (mirrors Rust domain module)

src-tauri/src/               # Rust backend
├── commands/                # Tauri IPC command handlers
├── domain/                  # Core domain types
├── project_store/           # SQLite persistence (Phase 1)
├── adapters/                # Source adapters (Phase 2/3)
├── jobs/                    # Background job system (Phase 4)
├── proposals/               # Proposal engine (Phase 6)
└── export/                  # Export pipeline (Phase 9)
```

## Implementation status

| Phase | Description | Status |
|---|---|---|
| 0 | App shell and conventions | ✓ Complete |
| 1 | Domain model and project persistence | ✓ Complete |
| 2 | Source registration | Planned |
| 3 | Structured source adapters and profiling | Planned |
| 4 | Job system | Planned |
| 5 | Schema graph canvas | Planned |
| 6 | Relationship proposals | Planned |
| 7 | Semantic consolidation | Planned |
| 8 | Identity resolution | Planned |
| 9 | Validation and export | Planned |
| 10 | Unstructured enrichment | Planned |
| 11 | Embeddings and LLM layers | Planned |
