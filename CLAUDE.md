# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules — Apply to Every Session

### 1. Always consult PLAN.md first

Before implementing any feature, read the relevant phase in `PLAN.md`. Every phase has:
- **Goal** — what the phase achieves
- **Deliverables** — concrete outputs required
- **Exit criteria** — the definition of done for that phase

Do not skip phases or implement out of order without an explicit reason from the user.

### 2. Consult BRAINSTORM.md for design intent

When making a design or architecture decision, check `BRAINSTORM.md` for the product vision and philosophy behind it. `PLAN.md` is the *what*; `BRAINSTORM.md` is the *why*.

### 3. Keep `documentation/` up to date — mandatory

**This is a primary responsibility, not an afterthought.** After completing any meaningful work — a phase, a subsystem, an architectural decision — update the relevant file in `documentation/`. If the file doesn't exist yet, create it. If no existing file fits, add a new one and register it in `documentation/README.md`.

Never consider a task complete if the documentation hasn't been updated to reflect it.

### 4. Keep CLAUDE.md up to date — mandatory

When the project structure, commands, tooling, or architectural approach changes materially, update this file in the same session. CLAUDE.md must always reflect the current state of the repo. Future Claude instances depend on this file being accurate.

## Commands

**Package manager**: Bun 1.3.5. Use `bun` instead of `npm`/`yarn`.

```bash
# Install dependencies
bun install

# Dev: all apps
bun run dev

# Dev: EntitySmith (Tauri) only
bun run dev:tauri

# Build all
bun run build

# Type-check all
bun run check-types

# Lint all
bun run lint

# Format
bun run format
```

**Tauri-specific** (from `apps/EntitySmith`):
```bash
bunx tauri dev       # Start Tauri dev mode (Rust + frontend)
bunx tauri build     # Production build
```

**Electron app** (from `apps/electron`):
```bash
bun run dev          # Start Electron dev mode
bun run build        # Build Electron app
```

No test runner is currently configured.

## Architecture

This is a **Turbo monorepo** undergoing a **rewrite from Electron to Tauri**.

### Apps

**`apps/EntitySmith`** — The primary product being built. A Tauri 2 desktop app.
- Frontend: React 19 + TypeScript, served by Vite (port 1420)
- Backend: Rust via Tauri 2 IPC commands
- Storage: SQLite (project state) + DuckDB (analytical queries)
- Currently a near-empty scaffold — all new features go here

**`apps/electron`** — The reference prototype. **Do not add features here.** It exists as a source of UI patterns, component logic, and architectural reference for the Tauri rewrite.
- Has working implementations of: dataset management, ReactFlow-based RDF/schema canvas, connection proposal UI, data profiling, Better-SQLite3 integration
- Main process / preload / renderer split with Electron IPC

### Packages

- `packages/ui` — Shared React component library
- `packages/eslint-config` — Shared ESLint config
- `packages/typescript-config` — Shared TypeScript config

### EntitySmith Architecture Layers

The Tauri rewrite is organized into three explicit layers (from PLAN.md):

1. **Frontend** (`apps/EntitySmith/src`): React UI, state management, XYFlow canvas
2. **Backend** (`apps/EntitySmith/src-tauri/src`): Rust services, Tauri IPC commands, domain model
3. **Storage** (`src-tauri`): SQLite for project state, DuckDB for analytical queries; source files are always read-only

Many concerns currently mixed into the Electron frontend's state should live behind Tauri IPC in the rewrite.

### Key Design Principles (from BRAINSTORM.md / PLAN.md)

- **Source data is never mutated** — all sources are read-only inputs
- **Non-destructive and auditable** — every suggestion/decision can be traced
- **Schema graph ≠ instance data** — keep these distinct layers
- **Provenance** attached to proposals, decisions, and exports
- **Lazy/analytical processing** — large datasets processed via DuckDB, not fully normalized in memory

### Planned Feature Phases (PLAN.md)

Phase 0 (current): App shell and conventions
Phase 1–2: Project persistence and source registration
Phase 3–5: Profiling, schema graph, relationship proposals
Phase 6–8: Entity consolidation, identity resolution, export
Phase 9–11: Validation, enrichment, LLM integration

### Tooling

- **Turbo**: orchestrates build/dev/lint across workspaces with caching
- **shadcn/ui** + **Tailwind CSS 4**: UI components (Electron; carry forward to EntitySmith)
- **XYFlow (ReactFlow)**: graph canvas editor
- **React Sigma + Graphology**: graph visualization
- **CodeMirror**: code editing widgets
- **Tauri plugin MCP bridge** (`tauri-plugin-mcp-bridge`): dev tooling integration
