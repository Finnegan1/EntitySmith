---
sidebar_position: 2
---

# Workspace Sidebar

**Directory:** `src/renderer/src/components/workspace-sidebar/`

The 280 px fixed left panel that lists all workspaces and their files.

## WorkspaceSidebar

**File:** `workspace-sidebar.tsx`

The shell component. Renders a fixed-width column with:

- A header row containing the label "Workspaces" and a `FolderPlus` icon button that calls `addWorkspace()`.
- A `ScrollArea` containing either an empty-state prompt or a list of `WorkspaceItem` components.

Reads from: `useWorkspaces()` — `workspaces`, `addWorkspace`.

## WorkspaceItem

**File:** `workspace-item.tsx`

A collapsible group for a single workspace. Consists of:

- A toggle button with a `ChevronRight` icon (rotates 90° when expanded) and the workspace's `name` (basename of its path).
- A `MoreHorizontal` icon button (visible on hover) that opens a `DropdownMenu` with a single destructive **Remove workspace** item.
- When expanded: a list of `WorkspaceFileItem` components, one per file. Shows "No files found" if the workspace is empty.

The expanded/collapsed state is local (`useState`) — it resets if the component unmounts.

Reads from: `useWorkspaces()` — `removeWorkspace`.

## WorkspaceFileItem

**File:** `workspace-file-item.tsx`

A single file entry. A `<button>` that:

- Shows the file name (truncated with `truncate`).
- Shows a `Badge` on the right:
  - `variant="destructive"` labelled **Error** for `status === 'invalid'`
  - `variant="secondary"` labelled **MD** for `status === 'markdown'`
  - No badge for `status === 'valid'`
- Highlights with `bg-accent` when `selectedFilePath === file.path`.
- On click: calls `selectFile(file.path)` and `setDataset(file.dataset)`.

Reads from: `useWorkspaces()` — `selectedFilePath`, `selectFile`. Writes to: `useDataset()` — `setDataset`.
