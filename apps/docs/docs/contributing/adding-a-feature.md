---
sidebar_position: 1
---

# Adding a Feature

This page walks through two complete examples to show the typical patterns.

---

## Example 1 — In-memory editing feature (no IPC needed)

**Goal:** Add a **Duplicate Row** button to the toolbar.

### Step 1: Add the action to DatasetContext

`src/renderer/src/hooks/use-dataset.ts`:

```ts
// 1. Add to DatasetContextValue interface
duplicateRow: (rowIdx: number) => void

// 2. Add the implementation inside useDatasetState()
const duplicateRow = useCallback((rowIdx: number) => {
  setDatasetRaw((prev) => {
    if (!prev) return prev
    const copy = [...prev.data]
    copy.splice(rowIdx + 1, 0, { ...prev.data[rowIdx] })
    return { ...prev, data: copy }
  })
  setIsDirty(true)
}, [])

// 3. Add to the return value
return { ..., duplicateRow }
```

### Step 2: Add a button in the toolbar

`src/renderer/src/components/dataset-table/dataset-table-toolbar.tsx`:

```tsx
const { dataset, duplicateRow } = useDataset()

// Render a button — or pass rowIdx down to a per-row action in DatasetTable
```

### Step 3: Done

No IPC changes needed — the existing `save()` call persists whatever the in-memory state contains.

---

## Example 2 — Feature that needs the file system (IPC required)

**Goal:** Add an **Export as CSV** button that writes a `.csv` file next to the `.json`.

### Step 1: Add a handler in main

`src/main/ipc/handlers.ts`:

```ts
ipcMain.handle('dataset:exportCsv', (_event, filePath: string, csvContent: string) => {
  const csvPath = filePath.replace(/\.json$/, '.csv')
  writeFileSync(csvPath, csvContent, 'utf-8')
})
```

### Step 2: Expose in preload

`src/preload/api.ts`:

```ts
exportCsv: (filePath: string, csvContent: string): Promise<void> =>
  ipcRenderer.invoke('dataset:exportCsv', filePath, csvContent),
```

### Step 3: Update the window type

`src/renderer/src/env.d.ts`:

```ts
exportCsv: (filePath: string, csvContent: string) => Promise<void>
```

### Step 4: Call from the renderer

Wherever the button lives:

```ts
async function handleExport() {
  if (!dataset || !selectedFilePath) return
  const header = Object.keys(dataset.data[0]).join(',')
  const rows = dataset.data.map(row =>
    Object.values(row).map(v => JSON.stringify(v)).join(',')
  )
  const csv = [header, ...rows].join('\n')
  await window.api.exportCsv(selectedFilePath, csv)
  toast.success('Exported as CSV.')
}
```

---

## Checklist for any new feature

- [ ] Does it need the file system? If yes, add an IPC channel (main → preload → env.d.ts).
- [ ] Does it change dataset state? Add the action to `DatasetContext` and set `isDirty = true`.
- [ ] Does it change workspace state? Add the action to `WorkspaceContext`.
- [ ] Does it show feedback? Use `toast.success` / `toast.error` from sonner.
- [ ] Does it modify rows? The existing `save()` will persist it — no extra save logic needed.
- [ ] TypeScript: did you update `DatasetContextValue` / `WorkspaceContextValue` / `WindowApi` interfaces?
