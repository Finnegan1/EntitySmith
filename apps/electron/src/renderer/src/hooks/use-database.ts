import { createContext, useCallback, useContext, useState } from 'react'
import { toast } from 'sonner'
import type { DatabaseSource, DbTableSchema, DatasetFile, DataEntry } from '@/types'

interface DatabaseContextValue {
  databases: DatabaseSource[]
  openDatabase: () => Promise<void>
  removeDatabase: (id: string) => void
  selectedDbTable: { dbFilePath: string; tableName: string } | null
  selectedDbDataset: DatasetFile | null
  selectDbTable: (dbFilePath: string, tableName: string) => Promise<void>
  clearDbSelection: () => void
  // Row cache: nodeId → DataEntry[]
  dbTableRows: Map<string, DataEntry[]>
  cacheDbTableRows: (dbFilePath: string, tableName: string) => Promise<void>
}

export const DatabaseContext = createContext<DatabaseContextValue | null>(null)

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
}

export function makeDbNodeId(filePath: string, tableName: string): string {
  return `${filePath}|${tableName}`
}

export function useDatabaseState(): DatabaseContextValue {
  const [databases, setDatabases] = useState<DatabaseSource[]>([])
  const [selectedDbTable, setSelectedDbTable] = useState<{ dbFilePath: string; tableName: string } | null>(null)
  const [selectedDbDataset, setSelectedDbDataset] = useState<DatasetFile | null>(null)
  const [dbTableRows, setDbTableRows] = useState<Map<string, DataEntry[]>>(new Map())

  const openDatabase = useCallback(async () => {
    const filePath = await window.api.openDbFileDialog()
    if (!filePath) return

    try {
      const tables = (await window.api.getDbSchema(filePath)) as DbTableSchema[]
      const source: DatabaseSource = {
        id: filePath,
        filePath,
        name: basename(filePath),
        tables,
      }
      setDatabases((prev) =>
        prev.some((d) => d.filePath === filePath)
          ? prev.map((d) => (d.filePath === filePath ? source : d))
          : [...prev, source]
      )
    } catch {
      toast.error('Failed to open database.')
    }
  }, [])

  const removeDatabase = useCallback((id: string) => {
    setDatabases((prev) => prev.filter((d) => d.id !== id))
    setSelectedDbTable((prev) => (prev?.dbFilePath === id ? null : prev))
    setSelectedDbDataset((prev) => (prev?.source?.startsWith(id) ? null : prev))
  }, [])

  const selectDbTable = useCallback(async (dbFilePath: string, tableName: string) => {
    setSelectedDbTable({ dbFilePath, tableName })
    setSelectedDbDataset(null)
    try {
      const rows = await window.api.queryDbTable(dbFilePath, tableName)
      const typedRows = rows as DataEntry[]
      const dataset: DatasetFile = {
        datasetName: tableName,
        description: `SQLite table: ${tableName} — ${basename(dbFilePath)}`,
        source: makeDbNodeId(dbFilePath, tableName),
        id: 'rowid',
        data: typedRows,
      }
      setSelectedDbDataset(dataset)
      // Populate the row cache so the RDF/Preview tabs can access this data
      const nodeId = makeDbNodeId(dbFilePath, tableName)
      setDbTableRows((prev) => {
        const next = new Map(prev)
        next.set(nodeId, typedRows)
        return next
      })
    } catch {
      toast.error(`Failed to load table "${tableName}".`)
    }
  }, [])

  // Pre-fetch & cache rows for a DB table dropped onto the canvas.
  // Called from rdf-canvas so triple generation works without the user first
  // clicking the table in the sidebar.
  const cacheDbTableRows = useCallback(async (dbFilePath: string, tableName: string) => {
    const nodeId = makeDbNodeId(dbFilePath, tableName)
    try {
      const rows = (await window.api.queryDbTable(dbFilePath, tableName)) as DataEntry[]
      setDbTableRows((prev) => {
        const next = new Map(prev)
        next.set(nodeId, rows)
        return next
      })
    } catch {
      // Non-fatal: triple generation will produce no triples for this table
    }
  }, [])

  const clearDbSelection = useCallback(() => {
    setSelectedDbTable(null)
    setSelectedDbDataset(null)
  }, [])

  return { databases, openDatabase, removeDatabase, selectedDbTable, selectedDbDataset, selectDbTable, clearDbSelection, dbTableRows, cacheDbTableRows }
}

export function useDatabases(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext)
  if (!ctx) throw new Error('useDatabases must be used within DatabaseContext.Provider')
  return ctx
}
