import { FolderOpen } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { WorkspaceItem } from './workspace-item'

export function WorkspaceSidebar() {
  const { workspaces, addWorkspace } = useWorkspaces()

  return (
    <div className="flex h-full w-[240px] shrink-0 flex-col bg-muted/20">
      {/* Explorer header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Explorer
        </span>
        <button
          onClick={addWorkspace}
          title="Open Folder"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        {workspaces.length === 0 ? (
          <div className="px-4 py-4 text-xs text-muted-foreground">
            <p>No folder opened.</p>
            <button
              onClick={addWorkspace}
              className="mt-1 text-primary hover:underline"
            >
              Open Folder…
            </button>
          </div>
        ) : (
          workspaces.map((ws) => <WorkspaceItem key={ws.path} workspace={ws} />)
        )}
      </ScrollArea>
    </div>
  )
}
