import { createContext, useCallback, useContext, useState } from 'react'
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Connection
} from '@xyflow/react'
import type { RdfNodeData, PendingConnection } from '@/types'

interface RdfGraphState {
  nodes: Node<RdfNodeData>[]
  edges: Edge[]
  canvasNodeIds: Set<string>
  pendingConnection: PendingConnection | null
  renamingEdgeId: string | null
  onNodesChange: OnNodesChange<Node<RdfNodeData>>
  onEdgesChange: OnEdgesChange
  addDatasetNode: (filePath: string, datasetName: string, attributes: string[], position: { x: number; y: number }) => void
  deleteNode: (nodeId: string) => void
  deleteEdge: (edgeId: string) => void
  startRenameEdge: (edgeId: string) => void
  confirmRenameEdge: (label: string) => void
  cancelRenameEdge: () => void
  confirmConnection: (label: string) => void
  cancelConnection: () => void
  setPendingConnection: (connection: PendingConnection | null) => void
  onConnect: (connection: Connection) => void
}

export const RdfGraphContext = createContext<RdfGraphState | null>(null)

// Fractional bend-point offsets for parallel edges (relative to the node span).
// At 0.2 and nodes 400 px apart → 80 px shift; at 200 px apart → 40 px shift.
const PATH_FRACTIONS = [0, -0.2, 0.2, -0.4, 0.4, -0.6, 0.6]

const EDGE_COLORS = [
  '#6366f1', // indigo
  '#22c55e', // green
  '#f59e0b', // amber
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#ef4444', // red
  '#84cc16', // lime
]

export function useRdfGraphState(): RdfGraphState {
  const [nodes, setNodes] = useState<Node<RdfNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null)
  const [renamingEdgeId, setRenamingEdgeId] = useState<string | null>(null)

  const canvasNodeIds = new Set(nodes.map((n) => n.id))

  const onNodesChange: OnNodesChange<Node<RdfNodeData>> = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  )

  const addDatasetNode = useCallback(
    (filePath: string, datasetName: string, attributes: string[], position: { x: number; y: number }) => {
      const newNode: Node<RdfNodeData> = {
        id: filePath,
        type: 'dataset',
        position,
        data: { datasetName, attributes, filePath }
      }
      setNodes((nds) => [...nds, newNode])
    },
    []
  )

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
  }, [])

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId))
  }, [])

  const startRenameEdge = useCallback((edgeId: string) => {
    setRenamingEdgeId(edgeId)
  }, [])

  const confirmRenameEdge = useCallback(
    (label: string) => {
      if (!renamingEdgeId) return
      setEdges((eds) =>
        eds.map((e) => (e.id === renamingEdgeId ? { ...e, label } : e))
      )
      setRenamingEdgeId(null)
    },
    [renamingEdgeId]
  )

  const cancelRenameEdge = useCallback(() => {
    setRenamingEdgeId(null)
  }, [])

  const onConnect = useCallback((connection: Connection) => {
    setPendingConnection({
      source: connection.source,
      sourceHandle: connection.sourceHandle ?? null,
      target: connection.target,
      targetHandle: connection.targetHandle ?? null
    })
  }, [])

  const confirmConnection = useCallback(
    (label: string) => {
      if (!pendingConnection) return
      setEdges((eds) => {
        const color = EDGE_COLORS[eds.length % EDGE_COLORS.length]
        const { source, target } = pendingConnection
        const parallelCount = eds.filter(
          (e) =>
            (e.source === source && e.target === target) ||
            (e.source === target && e.target === source)
        ).length
        const pathFraction = PATH_FRACTIONS[parallelCount % PATH_FRACTIONS.length]
        const newEdge: Edge = {
          id: `${pendingConnection.source}-${pendingConnection.sourceHandle ?? ''}-${pendingConnection.target}-${pendingConnection.targetHandle ?? ''}-${Date.now()}`,
          source: pendingConnection.source,
          sourceHandle: pendingConnection.sourceHandle,
          target: pendingConnection.target,
          targetHandle: pendingConnection.targetHandle,
          label,
          type: 'colored',
          animated: false,
          data: { pathFraction },
          style: { stroke: color, strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed' as const, color }
        }
        return addEdge(newEdge, eds)
      })
      setPendingConnection(null)
    },
    [pendingConnection]
  )

  const cancelConnection = useCallback(() => {
    setPendingConnection(null)
  }, [])

  return {
    nodes,
    edges,
    canvasNodeIds,
    pendingConnection,
    renamingEdgeId,
    onNodesChange,
    onEdgesChange,
    addDatasetNode,
    deleteNode,
    deleteEdge,
    startRenameEdge,
    confirmRenameEdge,
    cancelRenameEdge,
    confirmConnection,
    cancelConnection,
    setPendingConnection,
    onConnect
  }
}

export function useRdfGraph(): RdfGraphState {
  const ctx = useContext(RdfGraphContext)
  if (!ctx) throw new Error('useRdfGraph must be used within RdfGraphContext.Provider')
  return ctx
}
