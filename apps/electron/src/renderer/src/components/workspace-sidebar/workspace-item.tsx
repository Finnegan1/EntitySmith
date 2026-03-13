import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, Trash2, MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkspaces } from '@/hooks/use-workspaces'
import type { Workspace } from '@/types'
import { WorkspaceFileItem } from './workspace-file-item'
import { cn } from '@/lib/utils'

interface Props {
  workspace: Workspace
}

export function WorkspaceItem({ workspace }: Props) {
  const [isOpen, setIsOpen] = useState(true)
  const { removeWorkspace } = useWorkspaces()

  return (
    <div>
      {/* Workspace row */}
      <div
        className="group flex cursor-pointer items-center gap-1 px-2 py-0.5 hover:bg-accent"
        onClick={() => setIsOpen((o) => !o)}
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        {isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        )}
        <span className="ml-0.5 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide">
          {workspace.name}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100',
                'hover:bg-muted hover:text-foreground'
              )}
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem
              onClick={() => removeWorkspace(workspace.path)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-3 w-3" />
              Remove workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Files */}
      {isOpen && (
        <div>
          {workspace.files.length === 0 ? (
            <p className="py-1 pl-10 text-[11px] text-muted-foreground">No files found</p>
          ) : (
            workspace.files.map((file) => <WorkspaceFileItem key={file.path} file={file} />)
          )}
        </div>
      )}
    </div>
  )
}
