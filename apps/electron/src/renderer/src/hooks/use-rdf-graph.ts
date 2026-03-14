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
        const newEdge: Edge = {
          id: `${pendingConnection.source}-${pendingConnection.sourceHandle ?? ''}-${pendingConnection.target}-${pendingConnection.targetHandle ?? ''}-${Date.now()}`,
          source: pendingConnection.source,
          sourceHandle: pendingConnection.sourceHandle,
          target: pendingConnection.target,
          targetHandle: pendingConnection.targetHandle,
          label,
          type: 'smoothstep',
          animated: false,
          style: { stroke: color, strokeWidth: 2 },
          labelStyle: { fill: color, fontWeight: 600, fontSize: 11 },
          labelBgStyle: { fill: '#1e293b', stroke: color },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 4,
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
