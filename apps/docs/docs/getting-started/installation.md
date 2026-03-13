---
sidebar_position: 1
---

# Installation

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| **Bun** | ≥ 1.3.5 | `brew install bun` or [bun.sh](https://bun.sh) |
| **Node.js** | ≥ 18 | [nodejs.org](https://nodejs.org) |
| **Git** | any | pre-installed on macOS / Linux |

:::caution Use Bun everywhere
This project uses **Bun** as its package manager. Never run `npm install` or `yarn` — Bun manages both the lockfile and workspace resolution. Running another package manager will corrupt `bun.lock`.
:::

## Clone and install

```bash
git clone https://github.com/Finnegan1/knowledge-graph-creator
cd knowledge-graph-creator
bun install
```

`bun install` resolves all workspaces (`apps/*`, `packages/*`) in one pass and writes a single `bun.lock` at the repo root.

## Start the app

```bash
bun run dev
```

This runs `turbo run dev`, which:

1. Builds the **main process** bundle (`src/main/`) via electron-vite
2. Builds the **preload script** bundle (`src/preload/`) via electron-vite
3. Starts the **Vite dev server** for the renderer at `http://localhost:5173`
4. Launches Electron, pointing it at the dev server URL

Hot module replacement works for all renderer code. Changes to `src/main/` or `src/preload/` require restarting `bun run dev`.

## Other useful commands

All commands below should be run from the repo root unless stated otherwise.

| Command | What it does |
|---|---|
| `bun run dev` | Start in development mode |
| `bun run build` | Production build to `apps/electron/out/` |
| `bun run typecheck` | Type-check all three tsconfigs (run from `apps/electron/`) |
| `bunx shadcn add <name>` | Add a shadcn component (run from `apps/electron/`) |

## Verify the setup

Once the app opens:

1. Click **Add Workspace** (folder+ icon in the sidebar header)
2. Navigate to `apps/electron/test_workspace/` in the file picker
3. You should see two files appear: `cities.json` and `programming-languages.json`, plus `README.md` with an **MD** badge
4. Click `cities.json` — an editable table with 6 rows should render

If the table renders, everything is working correctly.
