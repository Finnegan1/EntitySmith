---
sidebar_position: 1
---

# Dataset Schema

Every JSON file the app manages must follow this structure.

## Top-level shape

```ts
interface DatasetFile {
  datasetName: string   // shown in the dataset header
  description: string   // shown below the name
  source:      string   // origin / attribution / URL
  data:        DataEntry[]
}

type DataEntry = Record<string, unknown>
```

### Example

```json
{
  "datasetName": "World Cities",
  "description": "Major world cities with population data.",
  "source": "https://example.com/cities",
  "data": [
    { "city": "Tokyo",    "country": "Japan",   "population": 13960000 },
    { "city": "Berlin",   "country": "Germany", "population": 3645000  },
    { "city": "New York", "country": "USA",     "population": 8336817  }
  ]
}
```

## The `data` array

Each element of `data` is a free-form object — you can use any key names and any JSON-serialisable values (`string`, `number`, `boolean`, `null`, nested objects, arrays). The only constraint is that **all entries must have the same set of keys** (see [Validation](./validation.md)).

The columns the table displays are derived from `Object.keys(data[0])`. The order of columns follows the key insertion order of the first entry.

## TypeScript types

All types are exported from `src/renderer/src/types/index.ts`:

```ts
export interface DatasetFile {
  datasetName: string
  description: string
  source: string
  data: DataEntry[]
}

export type DataEntry = Record<string, unknown>

export type FileStatus = 'valid' | 'invalid' | 'markdown'

export interface WorkspaceFile {
  name: string
  path: string
  status: FileStatus
  validationErrors: ValidationError[]
  dataset: DatasetFile | null   // null when status is 'invalid' or 'markdown'
}

export interface Workspace {
  path: string
  name: string   // basename of path
  files: WorkspaceFile[]
}

export type ValidationErrorKind =
  | 'MALFORMED_JSON'
  | 'MISSING_FIELDS'
  | 'INCONSISTENT_ATTRIBUTES'

export interface ValidationError {
  kind: ValidationErrorKind
  message: string
}

export interface SaveDatasetPayload {
  filePath: string
  dataset: DatasetFile
}

export interface RawFileResult {
  name: string
  path: string
  content: string | null   // null if the file could not be read
  isMarkdown: boolean
}
```
