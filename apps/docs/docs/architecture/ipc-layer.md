---
sidebar_position: 2
---

# IPC Layer

The renderer process has no file system access. Every operation that touches disk goes through a named IPC channel using `ipcRenderer.invoke` (Electron's request/response pattern — it returns a Promise).

## Channel reference

| Channel | Args | Returns | What it does |
|---|---|---|---|
| `dialog:openFolder` | — | `string \| null` | Opens a native folder picker; returns the selected path or null if cancelled |
| `workspace:list` | — | `string[]` | Reads all saved workspace paths from `workspaces.json` |
| `workspace:add` | `path: string` | `void` | Appends a path to `workspaces.json` |
| `workspace:remove` | `path: string` | `void` | Removes a path from `workspaces.json` |
| `workspace:readFiles` | `workspacePath: string` | `RawFileResult[]` | Lists every `.json` and `.md` file in the folder and returns their raw string content |
| `dataset:save` | `{ filePath, dataset }` | `void` | Serialises a `DatasetFile` to JSON and writes it to `filePath` |

## How a call flows end-to-end

```
Renderer component
  └─ window.api.readWorkspaceFiles(path)
       └─ preload/api.ts: ipcRenderer.invoke('workspace:readFiles', path)
            └─ main/ipc/handlers.ts: ipcMain.handle('workspace:readFiles', ...)
                 └─ readdirSync + readFileSync
                      └─ returns RawFileResult[] back up the chain
```

## How to add a new channel

**1. Register the handler** in `src/main/ipc/handlers.ts`:

```ts
ipcMain.handle('myFeature:doSomething', async (_event, arg: string) => {
  // Node.js code here — fs, path, os, etc.
  return result
})
```

**2. Expose it in the preload** at `src/preload/api.ts`:

```ts
export const api = {
  // ... existing methods
  doSomething: (arg: string): Promise<ReturnType> =>
    ipcRenderer.invoke('myFeature:doSomething', arg),
}
```

**3. Update the type declaration** in `src/renderer/src/env.d.ts`:

```ts
interface WindowApi {
  // ... existing methods
  doSomething: (arg: string) => Promise<ReturnType>
}
```

**4. Call it from the renderer**:

```ts
const result = await window.api.doSomething(arg)
```

That's all four files. No other changes needed.

:::tip Channel naming convention
Use `noun:verb` format — `workspace:add`, `dialog:openFolder`, `dataset:save`. The noun is the domain, the verb is the action.
:::

## Workspace persistence

`workspace-store.ts` manages a plain JSON array of absolute folder paths, written to the OS-specific user data directory:

```
macOS:   ~/Library/Application Support/knowledge-graph-creator/workspaces.json
Linux:   ~/.config/knowledge-graph-creator/workspaces.json
Windows: %APPDATA%\knowledge-graph-creator\workspaces.json
```

The file is created on first write. If it is missing or corrupt, `readWorkspaces()` returns `[]` silently.

`initWorkspaceStore(userDataPath)` is called once in `main/index.ts` before `createWindow()`, using `app.getPath('userData')` to get the correct OS path.
