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

interface EdgeLabelDialogProps {
  open: boolean
  initialValue?: string
  title?: string
  confirmLabel?: string
  placeholder?: string
  onConfirm: (label: string) => void
  onCancel: () => void
}

export function EdgeLabelDialog({
  open,
  initialValue = '',
  title = 'Name this connection',
  confirmLabel = 'Add connection',
  placeholder = 'e.g. ex:hasAttribute, schema:knows',
  onConfirm,
  onCancel
}: EdgeLabelDialogProps) {
  const [label, setLabel] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setLabel(initialValue)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
    }
  }, [open, initialValue])

  function handleConfirm() {
    const trimmed = label.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Input
            ref={inputRef}
            placeholder={placeholder}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            className="font-mono text-sm"
          />
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
