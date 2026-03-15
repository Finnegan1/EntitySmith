import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface EntityInfo {
  /** Raw table / dataset name shown in small muted text */
  name: string
  /** RDF class label shown prominently */
  rdfClass: string
}

interface EdgeLabelDialogProps {
  open: boolean
  initialValue?: string
  initialBidirectional?: boolean
  initialReverseLabel?: string
  title?: string
  confirmLabel?: string
  placeholder?: string
  /** If provided, a connection strip is rendered showing direction */
  sourceEntity?: EntityInfo
  targetEntity?: EntityInfo
  onConfirm: (label: string, bidirectional: boolean, reverseLabel: string) => void
  onCancel: () => void
}

export function EdgeLabelDialog({
  open,
  initialValue = '',
  initialBidirectional = false,
  initialReverseLabel = '',
  title = 'Name this connection',
  confirmLabel = 'Add connection',
  placeholder = 'e.g. works for, contains, employs',
  sourceEntity,
  targetEntity,
  onConfirm,
  onCancel
}: EdgeLabelDialogProps) {
  const [label, setLabel] = useState('')
  const [bidirectional, setBidirectional] = useState(false)
  const [reverseLabel, setReverseLabel] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const reverseInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setLabel(initialValue)
      setBidirectional(initialBidirectional)
      setReverseLabel(initialReverseLabel)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
    }
  }, [open, initialValue, initialBidirectional, initialReverseLabel])

  function handleConfirm() {
    const trimmed = label.trim()
    if (!trimmed) return
    onConfirm(trimmed, bidirectional, reverseLabel.trim())
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') onCancel()
  }

  function handleToggleBidirectional() {
    const next = !bidirectional
    setBidirectional(next)
    if (next) {
      setTimeout(() => {
        reverseInputRef.current?.focus()
      }, 50)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {/* Connection strip — shows source and target entity names */}
          {sourceEntity && targetEntity && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
              {/* Source */}
              <div className="flex min-w-0 flex-1 flex-col items-start">
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {sourceEntity.name}
                </span>
                <span className="truncate font-mono text-sm font-semibold text-foreground">
                  {sourceEntity.rdfClass}
                </span>
              </div>

              {/* Arrow — updates live with the bidirectional toggle */}
              <div className="flex shrink-0 flex-col items-center gap-0.5 text-muted-foreground">
                {bidirectional ? (
                  <>
                    <span className="text-xs leading-none">←</span>
                    <span className="text-xs leading-none">→</span>
                  </>
                ) : (
                  <span className="text-base leading-none">→</span>
                )}
              </div>

              {/* Target */}
              <div className="flex min-w-0 flex-1 flex-col items-end">
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {targetEntity.name}
                </span>
                <span className="truncate font-mono text-sm font-semibold text-foreground">
                  {targetEntity.rdfClass}
                </span>
              </div>
            </div>
          )}

          {/* Direction toggle */}
          <button
            type="button"
            onClick={handleToggleBidirectional}
            className={[
              'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
              bidirectional
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
            ].join(' ')}
          >
            <span className="text-base leading-none">
              {bidirectional ? '↔' : '→'}
            </span>
            {bidirectional ? 'Bidirectional' : 'One-way'}
            <span className="ml-auto text-xs opacity-60">
              {bidirectional ? 'triples in both directions' : 'triples source → target'}
            </span>
          </button>

          {/* Forward predicate */}
          <div className="flex flex-col gap-1">
            {bidirectional && (
              <label className="text-xs text-muted-foreground pl-1">
                {'\u2192'} Forward predicate
              </label>
            )}
            <Input
              ref={inputRef}
              placeholder={placeholder}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              className="font-mono text-sm"
            />
          </div>

          {/* Reverse predicate — only shown when bidirectional */}
          {bidirectional && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground pl-1">
                {'\u2190'} Reverse predicate{' '}
                <span className="opacity-60">(leave blank to reuse forward)</span>
              </label>
              <Input
                ref={reverseInputRef}
                placeholder={placeholder}
                value={reverseLabel}
                onChange={(e) => setReverseLabel(e.target.value)}
                onKeyDown={handleKeyDown}
                className="font-mono text-sm"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!label.trim()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
