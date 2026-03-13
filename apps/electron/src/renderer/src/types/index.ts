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
  dataset: DatasetFile | null
}

export interface Workspace {
  path: string
  name: string
  files: WorkspaceFile[]
}

export type ValidationErrorKind = 'MALFORMED_JSON' | 'MISSING_FIELDS' | 'INCONSISTENT_ATTRIBUTES'

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
  content: string | null
  isMarkdown: boolean
}
