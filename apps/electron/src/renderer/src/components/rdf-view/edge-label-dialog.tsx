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
  onConfirm: (label: string) => void
  onCancel: () => void
}

export function EdgeLabelDialog({ open, onConfirm, onCancel }: EdgeLabelDialogProps) {
  const [label, setLabel] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setLabel('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

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
          <DialogTitle>Name this connection</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Input
            ref={inputRef}
            placeholder="e.g. includes, relatedTo, hasAttribute"
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
            Add connection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
