import { FileJson2, FileText, AlertTriangle } from 'lucide-react'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { useDataset } from '@/hooks/use-dataset'
import type { WorkspaceFile } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  file: WorkspaceFile
}

export function WorkspaceFileItem({ file }: Props) {
  const { selectedFilePath, selectFile } = useWorkspaces()
  const { setDataset } = useDataset()
  const isSelected = selectedFilePath === file.path

  function handleClick() {
    selectFile(file.path)
    setDataset(file.dataset)
  }

  const Icon =
    file.status === 'markdown'
      ? FileText
      : file.status === 'invalid'
        ? AlertTriangle
        : FileJson2

  return (
    <button
      onClick={handleClick}
      className={cn(
        'flex w-full items-center gap-1.5 py-0.5 pl-9 pr-3 text-left transition-colors hover:bg-accent',
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
          'truncate font-mono text-[11px]',
          file.status === 'invalid' && 'text-destructive'
        )}
      >
        {file.name}
      </span>
    </button>
  )
}
