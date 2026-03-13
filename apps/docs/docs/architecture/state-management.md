---
sidebar_position: 3
---

# State Management

There is no external state library (no Zustand, no Redux). Two React contexts cover everything. Both are instantiated in `App.tsx` and provided to the entire component tree.

## WorkspaceContext

**File:** `src/renderer/src/hooks/use-workspaces.ts`

Owns the list of workspaces and the currently selected file.

### State

| Field | Type | Description |
|---|---|---|
| `workspaces` | `Workspace[]` | All loaded workspaces with their validated files |
| `selectedFilePath` | `string \| null` | Absolute path of the file currently open in the editor |

### Actions

| Action | What it does |
|---|---|
| `loadWorkspaces()` | Calls `workspace:list` IPC, then `workspace:readFiles` for each path, runs validation, builds the `Workspace[]` state. Called once on mount. |
| `addWorkspace()` | Opens a folder dialog (`dialog:openFolder`), calls `workspace:add` IPC, reads and validates the new folder's files, appends to state. No-ops if cancelled or if the path is already loaded. |
| `removeWorkspace(path)` | Calls `workspace:remove` IPC, removes from state, clears `selectedFilePath` if it was inside the removed workspace. |
| `selectFile(path)` | Sets `selectedFilePath`. |

### Validation at load time

When `loadWorkspaces` or `addWorkspace` runs, each raw file goes through `validateDataset()` immediately. The resulting `WorkspaceFile` — with `status`, `validationErrors`, and `dataset` — is stored in state. **Validation happens once and is not repeated on every render.** If you edit a file externally and want it re-validated, remove and re-add the workspace.

## DatasetContext

**File:** `src/renderer/src/hooks/use-dataset.ts`

Owns the in-memory copy of the dataset that is currently being edited.

### State

| Field | Type | Description |
|---|---|---|
| `dataset` | `DatasetFile \| null` | The mutable working copy of the open dataset |
| `isDirty` | `boolean` | `true` once any edit has been made since the last save |

### Actions

| Action | What it does |
|---|---|
| `setDataset(d)` | Replaces the working copy; resets `isDirty` to `false`. Called when the user clicks a file in the sidebar. |
| `updateCell(rowIdx, col, val)` | Immutably updates one cell in `data[rowIdx][col]`; sets `isDirty = true`. |
| `addAttribute(name, default)` | Iterates every entry and sets `entry[name] = default`; sets `isDirty = true`. |
| `removeAttribute(name)` | Iterates every entry and deletes `entry[name]`; sets `isDirty = true`. |
| `save(filePath)` | Calls `dataset:save` IPC; on success resets `isDirty = false` and shows a sonner toast. On error shows a destructive toast; `isDirty` stays `true`. |

### isDirty lifecycle

```
setDataset()    →  isDirty = false
updateCell()    →  isDirty = true
addAttribute()  →  isDirty = true
removeAttribute() → isDirty = true
save() success  →  isDirty = false
save() error    →  isDirty unchanged (still true)
```

## Context wiring in App.tsx

Both contexts are instantiated by their `useXxxState()` hooks (which contain the actual `useState` / `useCallback` logic) and passed to `Context.Provider`. Child components read them with `useWorkspaces()` / `useDataset()`.

```tsx
export function App() {
  const workspaceValue = useWorkspacesState()
  const datasetValue = useDatasetState()

  return (
    <WorkspaceContext.Provider value={workspaceValue}>
      <DatasetContext.Provider value={datasetValue}>
        <AppInner />
      </DatasetContext.Provider>
    </WorkspaceContext.Provider>
  )
}
```

Both `useWorkspaces()` and `useDataset()` throw if called outside their provider, so missing a provider is caught immediately during development.

## Keyboard save

`KeyboardSave` is a render-nothing component that sits inside both providers and attaches a `keydown` listener for Cmd/Ctrl+S:

```tsx
function KeyboardSave() {
  const { selectedFilePath } = useWorkspaces()
  const { isDirty, save } = useDataset()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (selectedFilePath && isDirty) save(selectedFilePath)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedFilePath, isDirty, save])

  return null
}
```
