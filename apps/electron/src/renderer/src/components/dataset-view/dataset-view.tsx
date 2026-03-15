import { useWorkspaces } from '@/hooks/use-workspaces'
import { useDatabases } from '@/hooks/use-database'
import { useDataset } from '@/hooks/use-dataset'
import { DatasetError } from './dataset-error'
import { DatasetHeader } from './dataset-header'
import { DatasetTable } from '@/components/dataset-table/dataset-table'
import { DatasetTableToolbar } from '@/components/dataset-table/dataset-table-toolbar'
import { DatasetContext, type DatasetContextValue } from '@/hooks/use-dataset'

// Read-only stub context for DB table display
function DbTableView() {
  const { selectedDbTable, selectedDbDataset } = useDatabases()

  if (!selectedDbTable) return null

  if (!selectedDbDataset) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading table…</p>
      </div>
    )
  }

  // Build a read-only dataset context value to reuse DatasetTable
  const readonlyCtx: DatasetContextValue = {
    dataset: selectedDbDataset,
    isDirty: false,
    setDataset: () => {},
    updateCell: () => {},
    addAttribute: () => {},
    removeAttribute: () => {},
    save: async () => {},
  }

  return (
    <DatasetContext.Provider value={readonlyCtx}>
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
          <span className="font-medium text-sm">{selectedDbTable.tableName}</span>
          <span className="text-xs text-muted-foreground">
            — {selectedDbDataset.data.length} rows (capped at 1000)
          </span>
        </div>
        {selectedDbDataset.data.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground">Table is empty.</p>
          </div>
        ) : (
          <DatasetTable />
        )}
      </div>
    </DatasetContext.Provider>
  )
}

export function DatasetView() {
  const { selectedFilePath, activeProject } = useWorkspaces()
  const { dataset } = useDataset()
  const { selectedDbTable } = useDatabases()

  // If a DB table is selected, show its view
  if (selectedDbTable) {
    return <DbTableView />
  }

  if (!selectedFilePath) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Select a dataset from the sidebar</p>
      </div>
    )
  }

  const workspaceFile = activeProject?.files.find((f) => f.path === selectedFilePath)

  if (!workspaceFile) return null

  if (workspaceFile.status === 'markdown') {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Markdown file preview not supported.</p>
      </div>
    )
  }

  if (workspaceFile.status === 'invalid') {
    return (
      <div className="flex h-full flex-col">
        <DatasetError errors={workspaceFile.validationErrors} />
      </div>
    )
  }

  if (!dataset || dataset.data.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <DatasetHeader />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">No entries in dataset.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <DatasetHeader />
      <DatasetTableToolbar />
      <DatasetTable />
    </div>
  )
}
