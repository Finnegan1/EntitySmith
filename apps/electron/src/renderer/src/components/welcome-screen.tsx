import { FolderOpen, Folder, ChevronRight, Database } from 'lucide-react'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { useDataset } from '@/hooks/use-dataset'

export function WelcomeScreen() {
  const { workspaces, addWorkspace, selectFile } = useWorkspaces()
  const { setDataset } = useDataset()

  function openWorkspace(wsPath: string) {
    const ws = workspaces.find((w) => w.path === wsPath)
    if (!ws) return
    const first = ws.files.find((f) => f.status === 'valid') ?? ws.files[0]
    if (first) {
      selectFile(first.path)
      setDataset(first.dataset)
    }
  }

  return (
    <div className="flex h-full items-start justify-center overflow-auto bg-background pt-24">
      <div className="w-full max-w-md space-y-10 px-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Knowledge Graph Creator</h1>
            <p className="text-xs text-muted-foreground">Dataset editor</p>
          </div>
        </div>

        {/* Start */}
        <div className="space-y-1.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Start
          </p>
          <button
            onClick={addWorkspace}
            className="group flex w-full items-center gap-3 rounded px-2 py-2 text-sm hover:bg-accent transition-colors"
          >
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>Open Folder…</span>
            <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘O
            </kbd>
          </button>
        </div>

        {/* Recent */}
        <div className="space-y-1.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Recent
          </p>
          {workspaces.length === 0 ? (
            <div className="rounded border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">No recent projects</p>
              <button
                onClick={addWorkspace}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Open a folder to get started
              </button>
            </div>
          ) : (
            workspaces.map((ws) => (
              <button
                key={ws.path}
                onClick={() => openWorkspace(ws.path)}
                className="group flex w-full items-center gap-3 rounded px-2 py-2 text-left text-sm hover:bg-accent transition-colors"
              >
                <Folder className="h-4 w-4 shrink-0 text-primary/70" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{ws.name}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {ws.path}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
