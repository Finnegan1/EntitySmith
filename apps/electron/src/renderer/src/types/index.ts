export interface DatasetFile {
  datasetName: string
  description: string
  source: string
  id: string
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

export type ValidationErrorKind =
  | 'MALFORMED_JSON'
  | 'MISSING_FIELDS'
  | 'INCONSISTENT_ATTRIBUTES'
  | 'DUPLICATE_IDS'

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

// ── XSD Datatypes ─────────────────────────────────────────────────────────────

export type XsdDatatype =
  | 'xsd:string'
  | 'xsd:integer'
  | 'xsd:decimal'
  | 'xsd:boolean'
  | 'xsd:dateTime'
  | 'xsd:date'
  | 'xsd:anyURI'

export const XSD_DATATYPES: XsdDatatype[] = [
  'xsd:string',
  'xsd:integer',
  'xsd:decimal',
  'xsd:boolean',
  'xsd:dateTime',
  'xsd:date',
  'xsd:anyURI',
]

export const DATATYPE_LABELS: Record<XsdDatatype, string> = {
  'xsd:string':   'str',
  'xsd:integer':  'int',
  'xsd:decimal':  'dec',
  'xsd:boolean':  'bool',
  'xsd:dateTime': 'dt',
  'xsd:date':     'date',
  'xsd:anyURI':   'uri',
}

// ── Column Mapping ────────────────────────────────────────────────────────────

export interface ColumnMapping {
  predicate: string   // CURIE, e.g. "ex:name"
  datatype: XsdDatatype
  omit: boolean       // if true, skip this column in triple output
}

// ── Namespace Prefix ──────────────────────────────────────────────────────────

export interface Prefix {
  prefix: string  // e.g. "ex"
  iri: string     // e.g. "http://example.org/"
}

// ── RDF Graph node data ───────────────────────────────────────────────────────

export interface RdfNodeData {
  datasetName: string
  attributes: string[]
  filePath: string
  idField: string
  rdfClass: string                               // e.g. "ex:User"
  subjectColumn: string                          // primary key column for URI
  columnMappings: Record<string, ColumnMapping>  // per-column RDF mapping
  // Set for DB-sourced nodes:
  dbSourcePath?: string
  dbTableName?: string
  [key: string]: unknown
}

export interface PendingConnection {
  source: string
  sourceHandle: string | null
  target: string
  targetHandle: string | null
  /** If this connection was triggered from a proposal, its id is stored here
   *  so it can be dismissed only after the user confirms (not on cancel). */
  proposalId?: string
}

// ── Database Source ────────────────────────────────────────────────────────────

export interface DbColumn {
  name: string
  type: string
  notNull: boolean
  primaryKey: boolean
}

export interface ForeignKey {
  fromColumn: string
  toTable: string
  toColumn: string
}

export interface DbTableSchema {
  tableName: string
  columns: DbColumn[]
  foreignKeys: ForeignKey[]
}

export interface DatabaseSource {
  id: string       // equals filePath
  filePath: string
  name: string     // basename of the file
  tables: DbTableSchema[]
}

// ── Connection Proposals (FK-inferred) ────────────────────────────────────────

export interface ConnectionProposal {
  id: string
  sourceNodeId: string
  targetNodeId: string
  sourceTable: string
  targetTable: string
  fromColumn: string
  toColumn: string
  dismissed: boolean
}
