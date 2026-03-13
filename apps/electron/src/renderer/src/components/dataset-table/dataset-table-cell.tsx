import { useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { useDataset } from '@/hooks/use-dataset'
import { cn } from '@/lib/utils'

interface Props {
  rowIdx: number
  col: string
  value: unknown
}

export function DatasetTableCell({ rowIdx, col, value }: Props) {
  const { updateCell } = useDataset()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft(String(value ?? ''))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commit() {
    updateCell(rowIdx, col, draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="h-7 font-mono text-xs px-1.5 py-0"
        autoFocus
      />
    )
  }

  return (
    <div
      onClick={startEdit}
      className={cn(
        'min-h-7 cursor-pointer rounded px-1.5 py-1 font-mono text-xs hover:bg-accent transition-colors',
        value === null || value === undefined || value === '' ? 'text-muted-foreground italic' : ''
      )}
    >
      {value === null || value === undefined ? '—' : String(value)}
    </div>
  )
}
