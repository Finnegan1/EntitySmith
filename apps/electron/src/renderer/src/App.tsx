import { useEffect, useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { Separator } from '@/components/ui/separator'
import { TopNav, type AppTab } from '@/components/top-nav'
import { DatasetSidebar } from '@/components/dataset-sidebar'
import { DatasetView } from '@/components/dataset-view/dataset-view'
import { RdfView } from '@/components/rdf-view'
import { PreviewView } from '@/components/preview-view'
import { WelcomeScreen } from '@/components/welcome-screen'
import { WorkspaceContext, useWorkspacesState, useWorkspaces } from '@/hooks/use-workspaces'
import { DatasetContext, useDatasetState, useDataset } from '@/hooks/use-dataset'
import { RdfGraphContext, useRdfGraphState } from '@/hooks/use-rdf-graph'

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

function StatusBar() {
  const { activeProject, selectedFilePath } = useWorkspaces()
  const { dataset } = useDataset()
  const file = activeProject?.files.find((f) => f.path === selectedFilePath)

  return (
    <div className="flex shrink-0 items-center justify-between bg-primary px-3 py-0.5 font-mono text-[11px] text-primary-foreground">
      <div className="flex min-w-0 items-center gap-3">
        {activeProject && <span className="shrink-0">{activeProject.name}</span>}
        {file && <span className="truncate opacity-60">{file.path}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-3 pl-4 opacity-80">
        {dataset && <span>{dataset.data.length} entries</span>}
        <span>KG Creator</span>
      </div>
    </div>
  )
}

function AppInner() {
  const { activeProject } = useWorkspaces()
  const [activeTab, setActiveTab] = useState<AppTab>('data')

  return (
    <>
      <KeyboardSave />
      <div className="flex h-screen flex-col overflow-hidden">
        <TopNav activeTab={activeTab} onTabChange={setActiveTab} />

        {activeProject ? (
          <div className="flex flex-1 overflow-hidden">
            <DatasetSidebar activeTab={activeTab} />
            <Separator orientation="vertical" />
            <main className="flex-1 overflow-hidden">
              {activeTab === 'data' ? <DatasetView /> : activeTab === 'rdf' ? <RdfView /> : <PreviewView />}
            </main>
          </div>
        ) : (
          <WelcomeScreen />
        )}

        <StatusBar />
      </div>
      <Toaster />
    </>
  )
}

export function App() {
  const workspaceValue = useWorkspacesState()
  const datasetValue = useDatasetState()
  const rdfGraphValue = useRdfGraphState()

  return (
    <WorkspaceContext.Provider value={workspaceValue}>
      <DatasetContext.Provider value={datasetValue}>
        <RdfGraphContext.Provider value={rdfGraphValue}>
          <AppInner />
        </RdfGraphContext.Provider>
      </DatasetContext.Provider>
    </WorkspaceContext.Provider>
  )
}

export default App
