import { Database } from 'lucide-react'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { cn } from '@/lib/utils'

export type AppTab = 'data' | 'rdf' | 'preview'

interface Props {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
}

export function TopNav({ activeTab, onTabChange }: Props) {
  const { activeProject } = useWorkspaces()

  return (
    <div className="flex shrink-0 items-stretch border-b bg-background">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 border-r">
        <Database className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold tracking-tight">KG Creator</span>
      </div>

      {/* Tabs */}
      {activeProject && (
        <div className="flex items-stretch">
          {(['data', 'rdf', 'preview'] as AppTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={cn(
                'px-5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {{ data: 'Data', rdf: 'RDF', preview: 'Preview' }[tab]}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1" />

      {/* Current project name */}
      {activeProject && (
        <div className="flex items-center px-4 border-l">
          <span className="font-mono text-[11px] text-muted-foreground">{activeProject.name}</span>
        </div>
      )}
    </div>
  )
}
