import { useState, useRef, useEffect } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export interface EditableEdgeData extends Record<string, unknown> {
  onUpdate: (id: string, predicate: string) => Promise<void>;
}

export function EditableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(label ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local value in sync when label changes externally (e.g. after save)
  useEffect(() => {
    if (!editing) setValue(String(label ?? ""));
  }, [label, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  async function commit() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== String(label ?? "")) {
      await (data as EditableEdgeData).onUpdate(id, trimmed);
    } else {
      setValue(String(label ?? ""));
    }
    setEditing(false);
  }

  function cancel() {
    setValue(String(label ?? ""));
    setEditing(false);
  }

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
        >
          {editing ? (
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void commit(); }
                if (e.key === "Escape") cancel();
              }}
              onBlur={() => void commit()}
              className="h-6 min-w-[80px] rounded border border-primary bg-background px-2 font-mono text-[11px] font-medium text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
              style={{ width: `${Math.max(80, value.length * 7 + 20)}px` }}
            />
          ) : (
            <span
              onDoubleClick={() => setEditing(true)}
              title="Double-click to edit"
              className="cursor-default rounded border border-[#e2e8f0] bg-white px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#1e293b] select-none hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              {label}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
