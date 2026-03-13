---
sidebar_position: 1
---

# Architecture Overview

Electron apps run code in three separate, isolated execution contexts. Understanding the boundary between them is the most important thing to know before touching any code.

## The three processes

```
┌─────────────────────────────────────────────────────┐
│  Main process  (Node.js — full OS access)            │
│  apps/electron/src/main/                             │
│                                                      │
│  • Creates the BrowserWindow                         │
│  • Reads and writes files                            │
│  • Opens native dialogs                              │
│  • Persists workspace list to userData               │
└──────────────────────┬──────────────────────────────┘
                       │  ipcMain / ipcRenderer
                       │  (named channels, request/response)
┌──────────────────────▼──────────────────────────────┐
│  Preload script  (sandboxed Node)                    │
│  apps/electron/src/preload/                          │
│                                                      │
│  • Runs before renderer JS loads                     │
│  • Has limited Node access                           │
│  • Bridges main ↔ renderer via contextBridge         │
│  • Exposes window.api (typed in env.d.ts)            │
└──────────────────────┬──────────────────────────────┘
                       │  window.api.*
                       │  (plain async function calls)
┌──────────────────────▼──────────────────────────────┐
│  Renderer process  (browser — zero Node access)      │
│  apps/electron/src/renderer/                         │
│                                                      │
│  • React 19 SPA compiled by Vite                     │
│  • All UI, state management, validation              │
│  • Calls window.api.* for anything requiring disk    │
└─────────────────────────────────────────────────────┘
```

## Key rule: the renderer is a browser

The renderer runs in a **pure browser context**. You cannot `import fs from 'fs'` there. Vite will warn you (and the production build will fail) if you accidentally import a Node built-in in renderer code.

If you need to do anything that requires the file system or OS APIs, it must go through an IPC call. See [IPC Layer](./ipc-layer.md) for how to add one.

## Source layout

```
apps/electron/src/
├── main/                     ← Node.js (main process)
│   ├── index.ts              ← BrowserWindow setup, app lifecycle
│   └── ipc/
│       ├── handlers.ts       ← registers every ipcMain.handle channel
│       └── workspace-store.ts ← reads/writes workspaces.json on disk
│
├── preload/                  ← sandboxed bridge
│   ├── index.ts              ← contextBridge.exposeInMainWorld('api', api)
│   └── api.ts                ← typed ipcRenderer.invoke wrappers
│
└── renderer/src/             ← React SPA (browser)
    ├── App.tsx               ← root component: providers + layout
    ├── main.tsx              ← ReactDOM entry point
    ├── env.d.ts              ← window.api type declaration
    ├── types/index.ts        ← all shared TypeScript interfaces
    ├── lib/
    │   ├── utils.ts          ← cn() class-name helper
    │   └── validate-dataset.ts ← JSON schema validator
    ├── hooks/
    │   ├── use-workspaces.ts ← WorkspaceContext + state logic
    │   └── use-dataset.ts    ← DatasetContext + editing state
    └── components/
        ├── workspace-sidebar/
        ├── dataset-view/
        ├── dataset-table/
        ├── dialogs/
        └── ui/               ← shadcn primitives (auto-generated, don't edit)
```

## Where types live

All shared TypeScript interfaces are in `src/renderer/src/types/index.ts`.

The main process (`src/main/`) cannot import from the renderer because the two are compiled by separate tsconfigs (`tsconfig.node.json` and `tsconfig.web.json`). TypeScript's composite project mode disallows cross-tsconfig source imports. For this reason, the two types that the main process needs (`RawFileResult` and `SaveDatasetPayload`) are defined inline in `ipc/handlers.ts`.

The renderer has the full type set and uses it everywhere.

## Build pipeline

electron-vite runs three Vite builds in one command:

| Bundle | Target | Output |
|---|---|---|
| main | `node22` | `out/main/index.js` |
| preload | `node22` | `out/preload/index.js` |
| renderer | `chrome130` | `out/renderer/` |

In development, the renderer is served by a Vite dev server (HMR). The main and preload bundles are rebuilt on file change and Electron is restarted automatically.
