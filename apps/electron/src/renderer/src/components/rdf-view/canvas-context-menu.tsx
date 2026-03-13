import { useEffect, useRef } from 'react'
import { Trash2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ContextMenuTarget =
  | { kind: 'node'; id: string; label: string }
  | { kind: 'edge'; id: string; label: string }

interface CanvasContextMenuProps {
  target: ContextMenuTarget
  position: { x: number; y: number }
  onDelete: () => void
  onRename?: () => void
  onClose: () => void
}

export function CanvasContextMenu({
  target,
  position,
  onDelete,
  onRename,
  onClose
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click outside or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Adjust so menu stays inside viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    zIndex: 1000
  }

  return (
    <div
      ref={menuRef}
      style={style}
      className="min-w-[180px] overflow-hidden rounded-md border border-border bg-popover shadow-lg"
    >
      {/* Header */}
      <div className="border-b border-border px-3 py-1.5">
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {target.kind === 'node' ? 'Dataset' : 'Connection'}: {target.label}
        </p>
      </div>

      {/* Actions */}
      <div className="p-1">
        {onRename && (
          <MenuItem
            icon={<Pencil className="h-3.5 w-3.5" />}
            label="Rename connection"
            onClick={() => { onRename(); onClose() }}
          />
        )}
        <MenuItem
          icon={<Trash2 className="h-3.5 w-3.5 text-destructive" />}
          label={target.kind === 'node' ? 'Remove from canvas' : 'Delete connection'}
          onClick={() => { onDelete(); onClose() }}
          destructive
        />
      </div>
    </div>
  )
}

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  destructive?: boolean
}

function MenuItem({ icon, label, onClick, destructive }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
        destructive && 'text-destructive hover:text-destructive'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
