import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { EntityTypeWithBindings } from "@/types";

export type EntityTypeNodeData = EntityTypeWithBindings & Record<string, unknown>;
export type EntityTypeNodeType = Node<EntityTypeNodeData, "entityType">;

export function EntityTypeNode({ data, selected }: NodeProps<EntityTypeNodeType>) {
  const { entityType, bindings } = data;
  return (
    <div
      className={`rounded-lg border bg-card shadow-sm w-[200px] overflow-hidden transition-shadow ${selected ? "ring-2 ring-primary shadow-md" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div className="bg-primary px-3 py-2">
        <p className="text-xs font-semibold text-primary-foreground truncate">{entityType.name}</p>
        {entityType.label && (
          <p className="text-[10px] text-primary-foreground/70 truncate">{entityType.label}</p>
        )}
      </div>
      {bindings.length > 0 && (
        <div className="flex flex-wrap gap-1 p-2">
          {bindings.map((b) => (
            <span
              key={b.id}
              className="rounded text-[10px] bg-muted px-1.5 py-0.5 text-muted-foreground truncate max-w-full"
            >
              {b.entityName}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </div>
  );
}
