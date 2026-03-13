---
sidebar_position: 3
---

# Dataset View

**Directory:** `src/renderer/src/components/dataset-view/`

The right-hand panel. Switches between different views depending on the selected file's status.

## DatasetView

**File:** `dataset-view.tsx`

The controller. Reads `selectedFilePath` and looks up the matching `WorkspaceFile` from `workspaces`. Decision tree:

```
selectedFilePath is null     → renders nothing (MainContent shows EmptyState instead)
file not found               → renders nothing
status === 'markdown'        → "Markdown file preview not supported" message
status === 'invalid'         → <DatasetError errors={file.validationErrors} />
dataset.data.length === 0    → <DatasetHeader /> + "No entries" message
else                         → <DatasetHeader /> + <DatasetTableToolbar /> + <DatasetTable />
```

Reads from: `useWorkspaces()` — `selectedFilePath`, `workspaces`. `useDataset()` — `dataset`.

## DatasetHeader

**File:** `dataset-header.tsx`

Displays dataset metadata and the save control.

- **Left side**: `datasetName` as a heading; `● unsaved` indicator (visible when `isDirty`); `description` and `source` as muted subtext.
- **Right side**: a Save button. Disabled when `!isDirty`. On click: calls `save(selectedFilePath)`.

Reads from: `useDataset()` — `dataset`, `isDirty`, `save`. `useWorkspaces()` — `selectedFilePath`.

## DatasetError

**File:** `dataset-error.tsx`

Renders a destructive `Alert` component with an `AlertCircle` icon. Lists each `ValidationError` as a `<li>` showing `kind: message`.

Props: `errors: ValidationError[]`.

Does not read from any context — it receives errors as a prop from `DatasetView`.
