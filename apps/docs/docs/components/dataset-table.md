---
sidebar_position: 4
---

# Dataset Table

**Directory:** `src/renderer/src/components/dataset-table/`

The editable table and its controls.

## DatasetTableToolbar

**File:** `dataset-table-toolbar.tsx`

A toolbar row above the table with two controls:

- **Add Attribute** button — opens `AddAttributeDialog`.
- **Remove Attribute** dropdown — lists all current column names. Selecting one sets `removeTarget` and opens `RemoveAttributeDialog`.

Both dialogs are rendered here (not in the table) so their state stays local to the toolbar.

Reads from: `useDataset()` — `dataset` (to derive column names).

## DatasetTable

**File:** `dataset-table.tsx`

Renders a shadcn `Table` inside a `ScrollArea` (flex-1, fills remaining height).

- **Header row**: a `#` column (row numbers) followed by one `TableHead` per key in `Object.keys(data[0])`.
- **Body rows**: one `TableRow` per entry in `data`. Each cell is a `DatasetTableCell`.

The column list is derived from the first entry: `Object.keys(dataset.data[0])`. Adding or removing an attribute via the toolbar updates the dataset in context, which re-renders this component with the new columns.

Reads from: `useDataset()` — `dataset`.

## DatasetTableCell

**File:** `dataset-table-cell.tsx`

A single editable cell. Has two modes controlled by local `useState`:

### Display mode (default)

A `<div>` that shows the cell value as a string. `null` / `undefined` renders as `—` in italic muted text. Clicking the div switches to edit mode.

### Edit mode

An `<Input>` pre-filled with `String(value)`. The text is auto-selected on focus via `inputRef.current?.select()`.

- **Enter** or **blur** → calls `updateCell(rowIdx, col, draft)` → returns to display mode.
- **Escape** → returns to display mode without saving.

The `draft` value is always a string. `updateCell` stores it as-is — the type is `unknown`, so the calling code determines what gets saved. If you need type coercion (e.g. store numbers as numbers), that would need to be added here.

Props: `rowIdx: number`, `col: string`, `value: unknown`.
Reads from: `useDataset()` — `updateCell`.

## AddAttributeDialog

**File:** `src/renderer/src/components/dialogs/add-attribute-dialog.tsx`

A `Dialog` with two `Input` fields:

- **Attribute name** — required, must not be empty, must not match an existing column name. Validated on submit.
- **Default value** — optional, stored as a string.

On confirm: calls `addAttribute(name.trim(), defaultVal)`. Resets form state on close.

## RemoveAttributeDialog

**File:** `src/renderer/src/components/dialogs/remove-attribute-dialog.tsx`

A confirmation `Dialog`. Shows the attribute name and the number of entries that will be affected (`dataset.data.length`).

On confirm: calls `removeAttribute(attributeName)`.

Props: `open`, `onOpenChange`, `attributeName: string | null`.
