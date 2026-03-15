import { useState } from 'react'
import {
  FileJson2,
  FileText,
  AlertTriangle,
  GripVertical,
  CheckCircle2,
  Database,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Key,
  Link,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { useDataset } from '@/hooks/use-dataset'
import { useRdfGraph } from '@/hooks/use-rdf-graph'
import { useDatabases, makeDbNodeId } from '@/hooks/use-database'
import { cn } from '@/lib/utils'
import type { WorkspaceFile, DatabaseSource, DbTableSchema } from '@/types'
import type { AppTab } from '@/components/top-nav'

interface DatasetSidebarProps {
  activeTab: AppTab
}

// ── File list ─────────────────────────────────────────────────────────────────

function FileList({ activeTab }: { activeTab: AppTab }) {
  const { activeProject, selectedFilePath, selectFile } = useWorkspaces()
  const { setDataset } = useDataset()
  const { canvasNodeIds } = useRdfGraph()
  const { clearDbSelection } = useDatabases()

  const [items, setItems] = useState<WorkspaceFile[]>([])
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

  if (!activeProject) return null

  const files = activeProject.files
  const displayItems =
    items.length === files.length && items.every((it) => files.some((f) => f.path === it.path))
      ? items
      : files

  function handleSelect(filePath: string) {
    const file = files.find((f) => f.path === filePath)
    if (!file) return
    clearDbSelection()
    selectFile(filePath)
    setDataset(file.dataset)
  }

  function handleSidebarDragStart(e: React.DragEvent, index: number, filePath: string) {
    setDraggingIndex(index)
    e.dataTransfer.setData('application/sidebar-index', String(index))
    e.dataTransfer.setData('application/rdf-dataset', filePath)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleSidebarDragOver(e: React.DragEvent, index: number) {
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

  if (displayItems.length === 0) {
    return <p className="px-3 text-xs text-muted-foreground">No files found.</p>
  }

  return (
    <>
      {displayItems.map((file, index) => {
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
            {activeTab === 'rdf' && file.status === 'valid' && isOnCanvas && (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" title="On canvas" />
            )}
            {activeTab === 'rdf' && file.status === 'valid' && !isOnCanvas && (
              <span className="shrink-0 text-[9px] text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                drag →
              </span>
            )}
          </div>
        )
      })}
    </>
  )
}

// ── DB table row ──────────────────────────────────────────────────────────────

function DbTableRow({
  dbSource,
  table,
  activeTab,
}: {
  dbSource: DatabaseSource
  table: DbTableSchema
  activeTab: AppTab
}) {
  const { selectedDbTable, selectDbTable } = useDatabases()
  const { canvasNodeIds } = useRdfGraph()

  const nodeId = makeDbNodeId(dbSource.filePath, table.tableName)
  const isSelected =
    selectedDbTable?.dbFilePath === dbSource.filePath &&
    selectedDbTable?.tableName === table.tableName
  const isOnCanvas = canvasNodeIds.has(nodeId)
  const hasFks = table.foreignKeys.length > 0
  const pkCol = table.columns.find((c) => c.primaryKey)

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('application/rdf-dataset', nodeId)
    e.dataTransfer.setData('application/db-source-path', dbSource.filePath)
    e.dataTransfer.setData('application/db-table-name', table.tableName)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="group flex w-full items-center gap-1.5 px-2 py-1 pl-7"
    >
      <button
        onClick={() => selectDbTable(dbSource.filePath, table.tableName)}
        className={cn(
          'flex flex-1 items-center gap-1.5 text-left rounded px-1 py-0.5 transition-colors hover:bg-accent min-w-0',
          isSelected && activeTab === 'data' && 'bg-accent text-accent-foreground'
        )}
      >
        <span className="truncate font-mono text-xs min-w-0">{table.tableName}</span>
        <span className="ml-auto shrink-0 text-[9px] text-muted-foreground/60">
          {table.columns.length}c
        </span>
      </button>
      {/* FK indicator */}
      {hasFks && (
        <Link className="h-2.5 w-2.5 shrink-0 text-amber-400/70" title={`${table.foreignKeys.length} foreign key(s)`} />
      )}
      {/* PK indicator */}
      {pkCol && (
        <Key className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" title={`PK: ${pkCol.name}`} />
      )}
      {activeTab === 'rdf' && isOnCanvas && (
        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" title="On canvas" />
      )}
      {activeTab === 'rdf' && !isOnCanvas && (
        <span className="shrink-0 text-[9px] text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
          drag →
        </span>
      )}
    </div>
  )
}

// ── DB source group ───────────────────────────────────────────────────────────

function DbSourceGroup({
  source,
  activeTab,
}: {
  source: DatabaseSource
  activeTab: AppTab
}) {
  const [expanded, setExpanded] = useState(true)
  const { removeDatabase } = useDatabases()
  const ChevronIcon = expanded ? ChevronDown : ChevronRight

  return (
    <div>
      <div className="group flex items-center gap-1 px-2 py-1">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-1.5 text-left rounded px-1 py-0.5 hover:bg-accent min-w-0"
        >
          <ChevronIcon className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          <Database className="h-3.5 w-3.5 shrink-0 text-blue-400" />
          <span className="truncate font-mono text-xs min-w-0 text-foreground/80">{source.name}</span>
          <span className="ml-auto shrink-0 text-[9px] text-muted-foreground/60">
            {source.tables.length}t
          </span>
        </button>
        <button
          onClick={() => removeDatabase(source.id)}
          className="h-5 w-5 flex shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
          title="Remove database"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {expanded && (
        <div>
          {source.tables.length === 0 ? (
            <p className="pl-8 text-[10px] text-muted-foreground/60 py-0.5">No tables found</p>
          ) : (
            source.tables.map((table) => (
              <DbTableRow key={table.tableName} dbSource={source} table={table} activeTab={activeTab} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

export function DatasetSidebar({ activeTab }: DatasetSidebarProps) {
  const { activeProject } = useWorkspaces()
  const { databases, openDatabase } = useDatabases()

  if (!activeProject) return null

  return (
    <div className="flex h-full w-[220px] shrink-0 flex-col bg-muted/20">
      {/* ── Datasets section ── */}
      <div className="shrink-0 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Datasets
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <FileList activeTab={activeTab} />
      </ScrollArea>

      {/* ── Databases section ── */}
      <div className="shrink-0 border-t">
        <div className="flex items-center px-3 py-2">
          <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Databases
          </span>
          <button
            onClick={openDatabase}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent transition-colors"
            title="Add SQLite database"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ScrollArea className="max-h-[40%] shrink-0">
        {databases.length === 0 ? (
          <p className="px-3 pb-2 text-[10px] text-muted-foreground/60">
            No databases. Click + to add SQLite.
          </p>
        ) : (
          databases.map((db) => (
            <DbSourceGroup key={db.id} source={db} activeTab={activeTab} />
          ))
        )}
      </ScrollArea>
    </div>
  )
}
