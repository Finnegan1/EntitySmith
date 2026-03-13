import { FileJson2, FileText, AlertTriangle } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { useDataset } from '@/hooks/use-dataset'
import { cn } from '@/lib/utils'

export function DatasetSidebar() {
  const { activeProject, selectedFilePath, selectFile } = useWorkspaces()
  const { setDataset } = useDataset()

  if (!activeProject) return null

  const files = activeProject.files

  function handleSelect(filePath: string) {
    const file = files.find((f) => f.path === filePath)
    if (!file) return
    selectFile(filePath)
    setDataset(file.dataset)
  }

  return (
    <div className="flex h-full w-[220px] shrink-0 flex-col bg-muted/20">
      <div className="px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Datasets
        </span>
      </div>
      <ScrollArea className="flex-1">
        {files.length === 0 ? (
          <p className="px-3 text-xs text-muted-foreground">No files found.</p>
        ) : (
          files.map((file) => {
            const isSelected = selectedFilePath === file.path
            const Icon =
              file.status === 'markdown'
                ? FileText
                : file.status === 'invalid'
                  ? AlertTriangle
                  : FileJson2

            return (
              <button
                key={file.path}
                onClick={() => handleSelect(file.path)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent',
                  isSelected && 'bg-accent text-accent-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    file.status === 'invalid' && 'text-destructive',
                    file.status === 'markdown' && 'text-blue-400',
                    file.status === 'valid' && 'text-emerald-500'
                  )}
                />
                <span
                  className={cn(
                    'truncate font-mono text-xs',
                    file.status === 'invalid' && 'text-destructive'
                  )}
                >
                  {file.name}
                </span>
              </button>
            )
          })
        )}
      </ScrollArea>
    </div>
  )
}
