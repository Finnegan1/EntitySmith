import { useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { Separator } from '@/components/ui/separator'
import { WorkspaceSidebar } from '@/components/workspace-sidebar/workspace-sidebar'
import { DatasetView } from '@/components/dataset-view/dataset-view'
import { WelcomeScreen } from '@/components/welcome-screen'
import { WorkspaceContext, useWorkspacesState, useWorkspaces } from '@/hooks/use-workspaces'
import { DatasetContext, useDatasetState, useDataset } from '@/hooks/use-dataset'

function KeyboardSave() {
  const { selectedFilePath } = useWorkspaces()
  const { isDirty, save } = useDataset()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (selectedFilePath && isDirty) save(selectedFilePath)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedFilePath, isDirty, save])

  return null
}

function TabBar() {
  const { selectedFilePath, workspaces } = useWorkspaces()
  const { isDirty } = useDataset()

  if (!selectedFilePath) return null

  const file = workspaces.flatMap((w) => w.files).find((f) => f.path === selectedFilePath)
  if (!file) return null

  return (
    <div className="flex shrink-0 border-b bg-muted/30">
      <div className="flex items-center gap-1.5 border-r border-t-2 border-t-primary bg-background px-4 py-1.5 text-xs font-mono">
        {isDirty && <span className="text-amber-500">●</span>}
        <span className={isDirty ? 'text-foreground' : 'text-muted-foreground'}>{file.name}</span>
      </div>
    </div>
  )
}

function StatusBar() {
  const { selectedFilePath, workspaces } = useWorkspaces()
  const { dataset } = useDataset()

  const ws = selectedFilePath
    ? workspaces.find((w) => w.files.some((f) => f.path === selectedFilePath))
    : null
  const file = selectedFilePath
    ? workspaces.flatMap((w) => w.files).find((f) => f.path === selectedFilePath)
    : null

  return (
    <div className="flex shrink-0 items-center justify-between bg-primary px-3 py-0.5 font-mono text-[11px] text-primary-foreground">
      <div className="flex items-center gap-3">
        {ws && <span className="opacity-90">{ws.name}</span>}
        {file && <span className="opacity-60">{file.path}</span>}
      </div>
      <div className="flex items-center gap-3 opacity-80">
        {dataset && <span>{dataset.data.length} entries</span>}
        <span>KG Creator</span>
      </div>
    </div>
  )
}

function MainContent() {
  const { selectedFilePath } = useWorkspaces()

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <TabBar />
      <div className="flex-1 overflow-hidden">
        {selectedFilePath ? <DatasetView /> : <WelcomeScreen />}
      </div>
    </main>
  )
}

function AppInner() {
  return (
    <>
      <KeyboardSave />
      <div className="flex h-screen flex-col overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <WorkspaceSidebar />
          <Separator orientation="vertical" />
          <MainContent />
        </div>
        <StatusBar />
      </div>
      <Toaster />
    </>
  )
}

export function App() {
  const workspaceValue = useWorkspacesState()
  const datasetValue = useDatasetState()

  return (
    <WorkspaceContext.Provider value={workspaceValue}>
      <DatasetContext.Provider value={datasetValue}>
        <AppInner />
      </DatasetContext.Provider>
    </WorkspaceContext.Provider>
  )
}

export default App
