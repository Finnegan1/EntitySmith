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
import type { RdfNodeData, PendingConnection, ColumnMapping } from '@/types'

interface RdfGraphState {
  nodes: Node<RdfNodeData>[]
  edges: Edge[]
  canvasNodeIds: Set<string>
  pendingConnection: PendingConnection | null
  renamingEdgeId: string | null
  onNodesChange: OnNodesChange<Node<RdfNodeData>>
  onEdgesChange: OnEdgesChange
  addDatasetNode: (
    filePath: string,
    datasetName: string,
    attributes: string[],
    idField: string,
    rdfClass: string,
    subjectColumn: string,
    columnMappings: Record<string, ColumnMapping>,
    position: { x: number; y: number }
  ) => void
  deleteNode: (nodeId: string) => void
  deleteEdge: (edgeId: string) => void
  startRenameEdge: (edgeId: string) => void
  confirmRenameEdge: (label: string, bidirectional: boolean, reverseLabel: string) => void
  cancelRenameEdge: () => void
  renamingEdgeBidirectional: boolean
  renamingEdgeReverseLabel: string
  confirmConnection: (label: string, bidirectional: boolean, reverseLabel: string) => void
  cancelConnection: () => void
  setPendingConnection: (connection: PendingConnection | null) => void
  onConnect: (connection: Connection) => void
  updateNodeRdfClass: (nodeId: string, rdfClass: string) => void
  updateNodeSubjectColumn: (nodeId: string, column: string) => void
  updateNodeColumnMapping: (nodeId: string, attr: string, mapping: Partial<ColumnMapping>) => void
}

export const RdfGraphContext = createContext<RdfGraphState | null>(null)

// Fractional bend-point offsets for parallel edges (relative to the node span).
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
    (
      filePath: string,
      datasetName: string,
      attributes: string[],
      idField: string,
      rdfClass: string,
      subjectColumn: string,
      columnMappings: Record<string, ColumnMapping>,
      position: { x: number; y: number }
    ) => {
      const newNode: Node<RdfNodeData> = {
        id: filePath,
        type: 'dataset',
        position,
        data: { datasetName, attributes, filePath, idField, rdfClass, subjectColumn, columnMappings }
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
    (label: string, bidirectional: boolean, reverseLabel: string) => {
      if (!renamingEdgeId) return
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== renamingEdgeId) return e
          const color = (e.style?.stroke as string) ?? '#6366f1'
          const effectiveReverseLabel = reverseLabel || label
          return {
            ...e,
            label: bidirectional ? `${label} / ${effectiveReverseLabel}` : label,
            data: { ...e.data, bidirectional, forwardLabel: label, reverseLabel: effectiveReverseLabel },
            markerEnd: { type: 'arrowclosed' as const, color },
            markerStart: bidirectional ? { type: 'arrowclosed' as const, color } : undefined,
          }
        })
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
    (label: string, bidirectional: boolean, reverseLabel: string) => {
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
        const effectiveReverseLabel = reverseLabel || label
        const newEdge: Edge = {
          id: `${pendingConnection.source}-${pendingConnection.sourceHandle ?? ''}-${pendingConnection.target}-${pendingConnection.targetHandle ?? ''}-${Date.now()}`,
          source: pendingConnection.source,
          sourceHandle: pendingConnection.sourceHandle,
          target: pendingConnection.target,
          targetHandle: pendingConnection.targetHandle,
          label: bidirectional ? `${label} / ${effectiveReverseLabel}` : label,
          type: 'colored',
          animated: false,
          data: { pathFraction, bidirectional, forwardLabel: label, reverseLabel: effectiveReverseLabel },
          style: { stroke: color, strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed' as const, color },
          markerStart: bidirectional ? { type: 'arrowclosed' as const, color } : undefined,
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

  const updateNodeRdfClass = useCallback((nodeId: string, rdfClass: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, rdfClass } } : n
      )
    )
  }, [])

  const updateNodeSubjectColumn = useCallback((nodeId: string, column: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, subjectColumn: column } } : n
      )
    )
  }, [])

  const updateNodeColumnMapping = useCallback(
    (nodeId: string, attr: string, mapping: Partial<ColumnMapping>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  columnMappings: {
                    ...n.data.columnMappings,
                    [attr]: { ...n.data.columnMappings[attr], ...mapping },
                  },
                },
              }
            : n
        )
      )
    },
    []
  )

  const renamingEdge = renamingEdgeId ? edges.find((e) => e.id === renamingEdgeId) : undefined
  const renamingEdgeBidirectional = (renamingEdge?.data?.bidirectional as boolean) ?? false
  const renamingEdgeReverseLabel =
    renamingEdge?.data?.bidirectional
      ? ((renamingEdge.data?.reverseLabel as string) ?? '')
      : ''

  return {
    nodes,
    edges,
    canvasNodeIds,
    pendingConnection,
    renamingEdgeId,
    renamingEdgeBidirectional,
    renamingEdgeReverseLabel,
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
    onConnect,
    updateNodeRdfClass,
    updateNodeSubjectColumn,
    updateNodeColumnMapping,
  }
}

export function useRdfGraph(): RdfGraphState {
  const ctx = useContext(RdfGraphContext)
  if (!ctx) throw new Error('useRdfGraph must be used within RdfGraphContext.Provider')
  return ctx
}
