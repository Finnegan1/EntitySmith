import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  ConnectionMode,
  Panel,
  type NodeMouseHandler,
  type EdgeMouseHandler
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useRdfGraph } from '@/hooks/use-rdf-graph'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { inferRdfClass, inferColumnMappings } from '@/lib/rdf-inference'
import { DatasetNode } from './dataset-node'
import { ColoredEdge } from './colored-edge'
import { EdgeLabelDialog } from './edge-label-dialog'
import { CanvasContextMenu, type ContextMenuTarget } from './canvas-context-menu'
import { PrefixManagerPanel } from './prefix-manager-panel'

const nodeTypes = { dataset: DatasetNode }
const edgeTypes = { colored: ColoredEdge }

interface ContextMenuState {
  target: ContextMenuTarget
  position: { x: number; y: number }
}

function RdfCanvasInner() {
  const {
    nodes,
    edges,
    pendingConnection,
    renamingEdgeId,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addDatasetNode,
    deleteNode,
    deleteEdge,
    startRenameEdge,
    confirmRenameEdge,
    cancelRenameEdge,
    confirmConnection,
    cancelConnection
  } = useRdfGraph()
  const { activeProject } = useWorkspaces()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // ── Drop from sidebar ────────────────────────────────────────────────────────
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const filePath = event.dataTransfer.getData('application/rdf-dataset')
      if (!filePath || !activeProject) return
      const file = activeProject.files.find((f) => f.path === filePath)
      if (!file || !file.dataset) return

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const attributes =
        file.dataset.data.length > 0 ? Object.keys(file.dataset.data[0]) : []

      // Auto-infer RDF class, subject column, and column mappings from data
      const rdfClass = inferRdfClass(file.dataset.datasetName)
      const subjectColumn = file.dataset.id
      const columnMappings = inferColumnMappings(attributes, file.dataset.data)

      addDatasetNode(
        filePath,
        file.dataset.datasetName,
        attributes,
        file.dataset.id,
        rdfClass,
        subjectColumn,
        columnMappings,
        position
      )
    },
    [activeProject, screenToFlowPosition, addDatasetNode]
  )

  // ── Context menus ────────────────────────────────────────────────────────────
  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault()
      setContextMenu({
        target: { kind: 'node', id: node.id, label: (node.data as { datasetName: string }).datasetName },
        position: { x: event.clientX, y: event.clientY }
      })
    },
    []
  )

  const onEdgeContextMenu: EdgeMouseHandler = useCallback(
    (event, edge) => {
      event.preventDefault()
      setContextMenu({
        target: { kind: 'edge', id: edge.id, label: String(edge.label ?? edge.id) },
        position: { x: event.clientX, y: event.clientY }
      })
    },
    []
  )

  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  const onPaneClick = useCallback(() => setContextMenu(null), [])

  const renamingEdgeCurrentLabel = useMemo(() => {
    if (!renamingEdgeId) return ''
    return String(edges.find((e) => e.id === renamingEdgeId)?.label ?? '')
  }, [renamingEdgeId, edges])

  const defaultEdgeOptions = useMemo(() => ({ type: 'colored' as const }), [])

  return (
    <div ref={reactFlowWrapper} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode="Delete"
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeColor={() => '#6366f133'}
          maskColor="rgba(0,0,0,0.4)"
          className="!border-border !bg-card"
        />

        {/* Prefix / namespace manager */}
        <Panel position="bottom-left">
          <PrefixManagerPanel />
        </Panel>
      </ReactFlow>

      {/* New connection label dialog */}
      <EdgeLabelDialog
        open={pendingConnection !== null}
        title="Name this predicate"
        confirmLabel="Add predicate"
        placeholder="e.g. ex:hasOrder, schema:knows"
        onConfirm={confirmConnection}
        onCancel={cancelConnection}
      />

      {/* Rename connection dialog */}
      <EdgeLabelDialog
        open={renamingEdgeId !== null}
        initialValue={renamingEdgeCurrentLabel}
        title="Rename predicate"
        confirmLabel="Save"
        onConfirm={confirmRenameEdge}
        onCancel={cancelRenameEdge}
      />

      {/* Context menu */}
      {contextMenu && (
        <CanvasContextMenu
          target={contextMenu.target}
          position={contextMenu.position}
          onClose={closeContextMenu}
          onDelete={() => {
            if (contextMenu.target.kind === 'node') deleteNode(contextMenu.target.id)
            else deleteEdge(contextMenu.target.id)
          }}
          onRename={
            contextMenu.target.kind === 'edge'
              ? () => startRenameEdge(contextMenu.target.id)
              : undefined
          }
        />
      )}
    </div>
  )
}

export function RdfCanvas() {
  return (
    <ReactFlowProvider>
      <RdfCanvasInner />
    </ReactFlowProvider>
  )
}
