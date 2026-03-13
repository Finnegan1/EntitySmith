import { useState, useCallback } from 'react'
import { FileJson2, FileText, AlertTriangle, GripVertical, CheckCircle2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { useDataset } from '@/hooks/use-dataset'
import { useRdfGraph } from '@/hooks/use-rdf-graph'
import { cn } from '@/lib/utils'
import type { WorkspaceFile } from '@/types'
import type { AppTab } from '@/components/top-nav'

interface DatasetSidebarProps {
  activeTab: AppTab
}

interface SidebarItem {
  file: WorkspaceFile
  index: number
}

export function DatasetSidebar({ activeTab }: DatasetSidebarProps) {
  const { activeProject, selectedFilePath, selectFile } = useWorkspaces()
  const { setDataset } = useDataset()
  const { canvasNodeIds } = useRdfGraph()

  const [items, setItems] = useState<WorkspaceFile[]>([])
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

  if (!activeProject) return null

  // Initialize items from project files if not set
  const files = activeProject.files
  const displayItems = items.length === files.length && items.every((it) => files.some((f) => f.path === it.path))
    ? items
    : files

  function handleSelect(filePath: string) {
    const file = files.find((f) => f.path === filePath)
    if (!file) return
    selectFile(filePath)
    setDataset(file.dataset)
  }

  // ─── Sidebar reordering drag ────────────────────────────────────────────────

  function handleSidebarDragStart(e: React.DragEvent, index: number, filePath: string) {
    setDraggingIndex(index)
    // Store both the sidebar reorder data and the rdf-dataset data
    e.dataTransfer.setData('application/sidebar-index', String(index))
    e.dataTransfer.setData('application/rdf-dataset', filePath)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleSidebarDragOver(e: React.DragEvent, index: number) {
    // Only handle sidebar reordering if it came from sidebar
    if (!e.dataTransfer.types.includes('application/sidebar-index')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  function handleSidebarDrop(e: React.DragEvent, targetIndex: number) {
    const sourceIndexStr = e.dataTransfer.getData('application/sidebar-index')
    if (!sourceIndexStr) return
    e.preventDefault()

    const sourceIndex = parseInt(sourceIndexStr, 10)
    if (sourceIndex === targetIndex) {
      setDragOverIndex(null)
      setDraggingIndex(null)
      return
    }

    const newItems = [...displayItems]
    const [moved] = newItems.splice(sourceIndex, 1)
    newItems.splice(targetIndex, 0, moved)
    setItems(newItems)
    setDragOverIndex(null)
    setDraggingIndex(null)
  }

  function handleDragEnd() {
    setDragOverIndex(null)
    setDraggingIndex(null)
  }

  return (
    <div className="flex h-full w-[220px] shrink-0 flex-col bg-muted/20">
      <div className="px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Datasets
        </span>
      </div>
      <ScrollArea className="flex-1">
        {displayItems.length === 0 ? (
          <p className="px-3 text-xs text-muted-foreground">No files found.</p>
        ) : (
          displayItems.map((file, index) => {
            const isSelected = selectedFilePath === file.path
            const isOnCanvas = canvasNodeIds.has(file.path)
            const isDraggingThis = draggingIndex === index
            const isDropTarget = dragOverIndex === index && draggingIndex !== index

            const Icon =
              file.status === 'markdown'
                ? FileText
                : file.status === 'invalid'
                  ? AlertTriangle
                  : FileJson2

            return (
              <div
                key={file.path}
                draggable
                onDragStart={(e) => handleSidebarDragStart(e, index, file.path)}
                onDragOver={(e) => handleSidebarDragOver(e, index)}
                onDrop={(e) => handleSidebarDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'group relative flex w-full items-center gap-1.5 px-2 py-1.5 transition-colors',
                  isDropTarget && 'border-t-2 border-primary',
                  isDraggingThis && 'opacity-40'
                )}
              >
                {/* Drag grip */}
                <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100 cursor-grab active:cursor-grabbing" />

                <button
                  onClick={() => handleSelect(file.path)}
                  className={cn(
                    'flex flex-1 items-center gap-1.5 text-left rounded px-1 py-0.5 transition-colors hover:bg-accent min-w-0',
                    isSelected && activeTab === 'data' && 'bg-accent text-accent-foreground'
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
                      'truncate font-mono text-xs min-w-0',
                      file.status === 'invalid' && 'text-destructive'
                    )}
                  >
                    {file.name}
                  </span>
                </button>

                {/* RDF mode: on-canvas indicator */}
                {activeTab === 'rdf' && file.status === 'valid' && isOnCanvas && (
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" title="On canvas" />
                )}

                {/* RDF mode: drag hint for valid files not yet on canvas */}
                {activeTab === 'rdf' && file.status === 'valid' && !isOnCanvas && (
                  <span className="shrink-0 text-[9px] text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                    drag →
                  </span>
                )}
              </div>
            )
          })
        )}
      </ScrollArea>
    </div>
  )
}
