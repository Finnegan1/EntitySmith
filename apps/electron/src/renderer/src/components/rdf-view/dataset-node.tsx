import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import type { RdfNodeData } from '@/types'

type DatasetNodeType = Node<RdfNodeData>

export function DatasetNode({ data, selected }: NodeProps<DatasetNodeType>) {
  return (
    <div
      className={`min-w-[180px] rounded-lg border bg-card shadow-sm transition-shadow ${
        selected ? 'border-primary shadow-md' : 'border-border'
      }`}
    >
      {/* Header */}
      <div className="rounded-t-lg bg-primary/10 px-3 py-2 border-b border-border">
        <p className="truncate font-mono text-xs font-semibold text-foreground">
          {data.datasetName}
        </p>
      </div>

      {/* Attributes */}
      <div className="py-1">
        {data.attributes.length === 0 ? (
          <p className="px-3 py-1 text-[10px] text-muted-foreground">No attributes</p>
        ) : (
          data.attributes.map((attr) => (
            <div key={attr} className="relative flex items-center px-3 py-0.5">
              {/* Left handle (target) */}
              <Handle
                type="target"
                position={Position.Left}
                id={`${attr}-target`}
                className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-primary !bg-background"
                style={{ left: -5 }}
              />

              <span className="flex-1 truncate font-mono text-[11px] text-muted-foreground">
                {attr}
              </span>

              {/* Right handle (source) */}
              <Handle
                type="source"
                position={Position.Right}
                id={`${attr}-source`}
                className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-primary !bg-background"
                style={{ right: -5 }}
              />
            </div>
          ))
        )}
      </div>

      {/* Bottom center connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-muted-foreground !bg-background"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-muted-foreground !bg-background"
      />
    </div>
  )
}
