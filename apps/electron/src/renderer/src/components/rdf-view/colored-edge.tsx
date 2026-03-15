import { useRef, useCallback } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps
} from '@xyflow/react'

export function ColoredEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  label,
  markerEnd,
  markerStart,
  data
}: EdgeProps) {
  const { setEdges, screenToFlowPosition } = useReactFlow()

  // pathFraction: offset as a fraction of the horizontal span.
  // Stored in edge data so it scales correctly regardless of node distance.
  const pathFraction = (data?.pathFraction as number) ?? 0
  const span = Math.abs(targetX - sourceX)
  const centerX = (sourceX + targetX) / 2 + pathFraction * Math.max(span, 80)

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    centerX
  })

  const color = (style?.stroke as string) ?? '#6366f1'

  // ── Drag to reposition label / bend point ─────────────────────────────────
  const isDragging = useRef(false)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    isDragging.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      const { x: flowX } = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const midX = (sourceX + targetX) / 2
      const effectiveSpan = Math.max(span, 80)
      const newFraction = (flowX - midX) / effectiveSpan
      const clamped = Math.max(-0.48, Math.min(0.48, newFraction))
      setEdges((eds) =>
        eds.map((ed) =>
          ed.id === id ? { ...ed, data: { ...ed.data, pathFraction: clamped } } : ed
        )
      )
    },
    [id, sourceX, targetX, span, setEdges, screenToFlowPosition]
  )

  const onPointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} markerStart={markerStart} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: '#1e293b',
              border: `1px solid ${color}`,
              color,
              padding: '3px 7px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              pointerEvents: 'all',
              whiteSpace: 'nowrap',
              cursor: 'ew-resize',
              userSelect: 'none',
              lineHeight: '1.5',
            }}
            className="nodrag nopan"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {data?.bidirectional ? (() => {
              const dx = targetX - sourceX
              const dy = targetY - sourceY
              const fwd = Math.abs(dx) >= Math.abs(dy)
                ? (dx >= 0 ? '→' : '←')
                : (dy >= 0 ? '↓' : '↑')
              const rev = Math.abs(dx) >= Math.abs(dy)
                ? (dx >= 0 ? '←' : '→')
                : (dy >= 0 ? '↑' : '↓')
              const showBoth = String(data.forwardLabel) !== String(data.reverseLabel)
              return (
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <span>{fwd} {String(data.forwardLabel)}</span>
                  {showBoth && (
                    <span style={{ opacity: 0.75 }}>{rev} {String(data.reverseLabel)}</span>
                  )}
                </span>
              )
            })() : (
              String(label)
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
