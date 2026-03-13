---
sidebar_position: 2
---

# Your First Workspace

This page walks through the full user flow so you understand what the app does before touching any code.

## Add a workspace

A **workspace** is just a folder on disk. The app watches no files — it reads the folder once when you add or reload it.

1. Click the **folder+ icon** in the top-right of the sidebar, or the **Add Workspace** button in the empty state.
2. A native folder picker opens. Select any directory that contains `.json` files.
3. The sidebar immediately shows all `.json` and `.md` files it found.

Workspace paths are persisted across sessions in:
- **macOS**: `~/Library/Application Support/knowledge-graph-creator/workspaces.json`
- **Linux**: `~/.config/knowledge-graph-creator/workspaces.json`
- **Windows**: `%APPDATA%\knowledge-graph-creator\workspaces.json`

## File status badges

Each file in the sidebar can show one of three states:

| Badge | Meaning |
|---|---|
| *(none)* | Valid dataset — ready to edit |
| **Error** (red) | JSON is malformed or doesn't match the required schema |
| **MD** (muted) | Markdown file — displayed as a note, not editable |

Click any **Error** file to see a detailed breakdown of exactly what is wrong.

## Edit a dataset

1. Click a valid `.json` file.
2. The header shows the dataset name, description, and source.
3. The table shows one row per entry. Click any cell to edit it inline.
4. Press **Enter** or click away to commit. Press **Escape** to cancel.
5. A `● unsaved` indicator appears in the header once you make a change.
6. Press **Cmd/Ctrl+S** or click **Save** to write the file to disk.

## Manage columns

Use the toolbar above the table to change the schema:

- **Add Attribute** — opens a dialog where you name the new column and set a default value. The new key is added to every entry immediately.
- **Remove Attribute** — a dropdown lists all current columns. Selecting one opens a confirmation dialog showing how many entries will be affected.

Both operations set the dirty flag, so they are not written to disk until you save.

## Remove a workspace

Hover over a workspace name in the sidebar to reveal the **⋯** menu. Choose **Remove workspace**. This removes the path from the persisted list but does not delete any files on disk.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| **Cmd/Ctrl+S** | Save the current dataset |
| **D** | Toggle dark / light theme |
| **Enter** (in cell) | Commit edit |
| **Escape** (in cell) | Cancel edit |
