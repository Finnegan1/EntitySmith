---
sidebar_position: 2
---

# Validation

Validation runs in the renderer via `src/renderer/src/lib/validate-dataset.ts`. It is called once when a workspace is loaded or added — not on every render or keystroke.

## The four rules

Rules are checked in order. The first failure short-circuits and returns immediately; subsequent rules are not evaluated.

### Rule 1 — Valid JSON

```
JSON.parse(raw)
```

If `JSON.parse` throws, the file gets:

```ts
{ kind: 'MALFORMED_JSON', message: 'File is not valid JSON.' }
```

### Rule 2 — Root is a plain object

The parsed value must be a non-null, non-array object. Arrays, strings, numbers, and `null` at the root are rejected:

```ts
{ kind: 'MALFORMED_JSON', message: 'JSON root must be an object.' }
```

### Rule 3 — Required fields present

The object must have all four keys: `datasetName`, `description`, `source`, `data`. The `data` field must be an array:

```ts
// missing keys
{ kind: 'MISSING_FIELDS', message: 'Missing required fields: source, data.' }

// data is not an array
{ kind: 'MISSING_FIELDS', message: '"data" field must be an array.' }
```

### Rule 4 — Consistent attributes

Every entry in `data` must have exactly the same set of keys. The check compares sorted key strings of each entry against the first entry:

```ts
{ kind: 'INCONSISTENT_ATTRIBUTES', message: 'Not all entries have the same attribute keys.' }
```

## Return value

```ts
function validateDataset(raw: string): {
  dataset: DatasetFile | null
  errors: ValidationError[]
}
```

- On success: `{ dataset: <parsed>, errors: [] }`
- On failure: `{ dataset: null, errors: [<one error>] }`

Currently at most one error is returned (the first failure). The `errors` field is an array to leave room for multiple diagnostics in the future.

## What happens to invalid files

A file that fails validation gets `status: 'invalid'` in `WorkspaceFile`. The sidebar shows a red **Error** badge. Clicking the file opens `DatasetError` — a destructive Alert listing each `ValidationError` with its `kind` and `message`. The table is not rendered.

## Empty datasets

A file that passes all four rules but has `data: []` is considered **valid**. The table renders with a header but an "No entries in dataset" message instead of rows. The toolbar (Add/Remove Attribute) is not shown because there are no keys to infer columns from.

## Validation is not re-run on edit

The in-memory `dataset` in `DatasetContext` is a mutable copy. Editing cells or adding/removing attributes does not re-validate. If you programmatically create an inconsistent state (e.g. by calling `addAttribute` for a key that already exists on some rows), the app will save it. This is intentional — the editor trusts its own output.
