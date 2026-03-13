import { useCallback, useMemo, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type ReactFlowInstance
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useRdfGraph } from '@/hooks/use-rdf-graph'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { DatasetNode } from './dataset-node'
import { EdgeLabelDialog } from './edge-label-dialog'

const nodeTypes = { dataset: DatasetNode }

function RdfCanvasInner() {
  const { nodes, edges, pendingConnection, onNodesChange, onEdgesChange, onConnect, addDatasetNode, confirmConnection, cancelConnection } = useRdfGraph()
  const { activeProject } = useWorkspaces()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

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

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      })

      const attributes = file.dataset.data.length > 0 ? Object.keys(file.dataset.data[0]) : []
      addDatasetNode(filePath, file.dataset.datasetName, attributes, position)
    },
    [activeProject, screenToFlowPosition, addDatasetNode]
  )

  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'smoothstep' as const
    }),
    []
  )

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
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode="Delete"
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeColor={() => 'hsl(var(--primary) / 0.3)'}
          maskColor="hsl(var(--background) / 0.7)"
          className="!border-border !bg-card"
        />
      </ReactFlow>

      <EdgeLabelDialog
        open={pendingConnection !== null}
        onConfirm={confirmConnection}
        onCancel={cancelConnection}
      />
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
