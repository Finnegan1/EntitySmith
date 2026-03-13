import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDataset } from '@/hooks/use-dataset'
import { useWorkspaces } from '@/hooks/use-workspaces'

export function DatasetHeader() {
  const { dataset, isDirty, save } = useDataset()
  const { selectedFilePath } = useWorkspaces()

  if (!dataset) return null

  return (
    <div className="flex shrink-0 items-center justify-between border-b bg-muted/10 px-4 py-2 gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{dataset.datasetName}</span>
          {dataset.description && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="truncate text-xs text-muted-foreground">{dataset.description}</span>
            </>
          )}
          {dataset.source && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-[11px] text-muted-foreground">{dataset.source}</span>
            </>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant={isDirty ? 'default' : 'ghost'}
        disabled={!isDirty}
        onClick={() => selectedFilePath && save(selectedFilePath)}
        className="h-7 shrink-0 gap-1.5 text-xs"
      >
        <Save className="h-3 w-3" />
        {isDirty ? 'Save' : 'Saved'}
      </Button>
    </div>
  )
}
