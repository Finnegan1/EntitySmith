import { useWorkspaces } from '@/hooks/use-workspaces'
import { DatasetError } from './dataset-error'
import { DatasetHeader } from './dataset-header'
import { DatasetTable } from '@/components/dataset-table/dataset-table'
import { DatasetTableToolbar } from '@/components/dataset-table/dataset-table-toolbar'
import { useDataset } from '@/hooks/use-dataset'

export function DatasetView() {
  const { selectedFilePath, activeProject } = useWorkspaces()
  const { dataset } = useDataset()

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
