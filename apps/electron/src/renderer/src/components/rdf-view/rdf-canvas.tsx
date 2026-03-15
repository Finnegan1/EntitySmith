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
  type EdgeMouseHandler,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useRdfGraph } from '@/hooks/use-rdf-graph'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { useDatabases, makeDbNodeId } from '@/hooks/use-database'
import { useConnectionProposals } from '@/hooks/use-connection-proposals'
import { inferRdfClass, inferColumnMappings } from '@/lib/rdf-inference'
import { DatasetNode } from './dataset-node'
import { ColoredEdge } from './colored-edge'
import { EdgeLabelDialog } from './edge-label-dialog'
import { CanvasContextMenu, type ContextMenuTarget } from './canvas-context-menu'
import { PrefixManagerPanel } from './prefix-manager-panel'
import type { RdfNodeData, ConnectionProposal, DatabaseSource, DbTableSchema } from '@/types'

const nodeTypes = { dataset: DatasetNode }
const edgeTypes = { colored: ColoredEdge }

interface ContextMenuState {
  target: ContextMenuTarget
  position: { x: number; y: number }
}

// ── FK proposal generation ────────────────────────────────────────────────────

function generateFkProposals(
  newNodeId: string,
  newTableName: string,
  newTableSchema: DbTableSchema,
  dbFilePath: string,
  databases: DatabaseSource[],
  existingNodes: Node<RdfNodeData>[]
): ConnectionProposal[] {
  const proposals: ConnectionProposal[] = []

  // FKs from the new table pointing to existing canvas nodes
  for (const fk of newTableSchema.foreignKeys) {
    const target = existingNodes.find(
      (n) => n.data.dbSourcePath === dbFilePath && n.data.dbTableName === fk.toTable
    )
    if (target) {
      proposals.push({
        id: `${newNodeId}→${target.id}::${fk.fromColumn}`,
        sourceNodeId: newNodeId,
        targetNodeId: target.id,
        sourceTable: newTableName,
        targetTable: fk.toTable,
        fromColumn: fk.fromColumn,
        toColumn: fk.toColumn,
        dismissed: false,
      })
    }
  }

  // FKs from existing canvas nodes pointing to the new table (reverse)
  for (const existingNode of existingNodes) {
    const existingDbPath = existingNode.data.dbSourcePath as string | undefined
    const existingTableName = existingNode.data.dbTableName as string | undefined
    if (!existingDbPath || !existingTableName) continue

    const existingDb = databases.find((d) => d.filePath === existingDbPath)
    const existingSchema = existingDb?.tables.find((t) => t.tableName === existingTableName)
    if (!existingSchema) continue

    for (const fk of existingSchema.foreignKeys) {
      if (fk.toTable === newTableName && existingDbPath === dbFilePath) {
        proposals.push({
          id: `${existingNode.id}→${newNodeId}::${fk.fromColumn}`,
          sourceNodeId: existingNode.id,
          targetNodeId: newNodeId,
          sourceTable: existingTableName,
          targetTable: newTableName,
          fromColumn: fk.fromColumn,
          toColumn: fk.toColumn,
          dismissed: false,
        })
      }
    }
  }

  return proposals
}

// ── Canvas inner ──────────────────────────────────────────────────────────────

function RdfCanvasInner() {
  const {
    nodes,
    edges,
    pendingConnection,
    renamingEdgeId,
    renamingEdgeBidirectional,
    renamingEdgeReverseLabel,
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
    cancelConnection,
  } = useRdfGraph()
  const { activeProject } = useWorkspaces()
  const { databases, cacheDbTableRows } = useDatabases()
  const { addProposals } = useConnectionProposals()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // ── Drop from sidebar ──────────────────────────────────────────────────────
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const dbSourcePath = event.dataTransfer.getData('application/db-source-path')
      const dbTableName = event.dataTransfer.getData('application/db-table-name')
      const filePath = event.dataTransfer.getData('application/rdf-dataset')

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })

      // ── DB table drop ────────────────────────────────────────────────────────
      if (dbSourcePath && dbTableName) {
        const dbSource = databases.find((d) => d.filePath === dbSourcePath)
        const tableSchema = dbSource?.tables.find((t) => t.tableName === dbTableName)
        if (!tableSchema || !dbSource) return

        const nodeId = makeDbNodeId(dbSourcePath, dbTableName)
        if (nodes.some((n) => n.id === nodeId)) return // already on canvas

        const attributes = tableSchema.columns.map((c) => c.name)
        const pkCol = tableSchema.columns.find((c) => c.primaryKey)
        const idField = pkCol?.name ?? attributes[0] ?? 'id'
        const rdfClass = inferRdfClass(dbTableName)
        const columnMappings = inferColumnMappings(attributes, [])

        addDatasetNode(
          nodeId,
          dbTableName,
          attributes,
          idField,
          rdfClass,
          idField,
          columnMappings,
          position,
          dbSourcePath,
          dbTableName
        )

        // Fetch and cache table rows so the RDF/Preview tabs can generate triples
        cacheDbTableRows(dbSourcePath, dbTableName)

        // Generate FK-based proposals against existing canvas nodes
        const proposals = generateFkProposals(
          nodeId,
          dbTableName,
          tableSchema,
          dbSourcePath,
          databases,
          nodes
        )
        if (proposals.length > 0) {
          addProposals(proposals)
        }
        return
      }

      // ── JSON file drop ───────────────────────────────────────────────────────
      if (!filePath || !activeProject) return
      const file = activeProject.files.find((f) => f.path === filePath)
      if (!file || !file.dataset) return

      const attributes =
        file.dataset.data.length > 0 ? Object.keys(file.dataset.data[0]) : []
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
    [activeProject, databases, nodes, screenToFlowPosition, addDatasetNode, addProposals, cacheDbTableRows]
  )

  // ── Context menus ──────────────────────────────────────────────────────────
  const onNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault()
    setContextMenu({
      target: { kind: 'node', id: node.id, label: (node.data as { datasetName: string }).datasetName },
      position: { x: event.clientX, y: event.clientY },
    })
  }, [])

  const onEdgeContextMenu: EdgeMouseHandler = useCallback((event, edge) => {
    event.preventDefault()
    setContextMenu({
      target: { kind: 'edge', id: edge.id, label: String(edge.label ?? edge.id) },
      position: { x: event.clientX, y: event.clientY },
    })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  const onPaneClick = useCallback(() => setContextMenu(null), [])

  const renamingEdgeCurrentLabel = useMemo(() => {
    if (!renamingEdgeId) return ''
    const edge = edges.find((e) => e.id === renamingEdgeId)
    return String((edge?.data?.forwardLabel as string) ?? edge?.label ?? '')
  }, [renamingEdgeId, edges])

  // Entity info for the connection dialogs
  const pendingSourceEntity = useMemo(() => {
    if (!pendingConnection) return undefined
    const n = nodes.find((node) => node.id === pendingConnection.source)
    if (!n) return undefined
    return { name: n.data.datasetName, rdfClass: n.data.rdfClass || n.data.datasetName }
  }, [pendingConnection, nodes])

  const pendingTargetEntity = useMemo(() => {
    if (!pendingConnection) return undefined
    const n = nodes.find((node) => node.id === pendingConnection.target)
    if (!n) return undefined
    return { name: n.data.datasetName, rdfClass: n.data.rdfClass || n.data.datasetName }
  }, [pendingConnection, nodes])

  const renamingEdgeSourceEntity = useMemo(() => {
    if (!renamingEdgeId) return undefined
    const edge = edges.find((e) => e.id === renamingEdgeId)
    const n = nodes.find((node) => node.id === edge?.source)
    if (!n) return undefined
    return { name: n.data.datasetName, rdfClass: n.data.rdfClass || n.data.datasetName }
  }, [renamingEdgeId, edges, nodes])

  const renamingEdgeTargetEntity = useMemo(() => {
    if (!renamingEdgeId) return undefined
    const edge = edges.find((e) => e.id === renamingEdgeId)
    const n = nodes.find((node) => node.id === edge?.target)
    if (!n) return undefined
    return { name: n.data.datasetName, rdfClass: n.data.rdfClass || n.data.datasetName }
  }, [renamingEdgeId, edges, nodes])

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

        <Panel position="bottom-left">
          <PrefixManagerPanel />
        </Panel>
      </ReactFlow>

      {/* New connection label dialog */}
      <EdgeLabelDialog
        open={pendingConnection !== null}
        title="Name this predicate"
        confirmLabel="Add predicate"
        placeholder="e.g. works for, contains, employs"
        sourceEntity={pendingSourceEntity}
        targetEntity={pendingTargetEntity}
        onConfirm={confirmConnection}
        onCancel={cancelConnection}
      />

      {/* Rename connection dialog */}
      <EdgeLabelDialog
        open={renamingEdgeId !== null}
        initialValue={renamingEdgeCurrentLabel}
        initialBidirectional={renamingEdgeBidirectional}
        initialReverseLabel={renamingEdgeReverseLabel}
        title="Rename predicate"
        confirmLabel="Save"
        sourceEntity={renamingEdgeSourceEntity}
        targetEntity={renamingEdgeTargetEntity}
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
