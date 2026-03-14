import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { usePrefixes } from '@/hooks/use-prefixes'
import type { Prefix } from '@/types'

export function PrefixManagerPanel() {
  const { prefixes, addPrefix, updatePrefix, removePrefix } = usePrefixes()
  const [open, setOpen] = useState(false)
  const [newPrefix, setNewPrefix] = useState('')
  const [newIri, setNewIri] = useState('')

  function handleAdd() {
    const p = newPrefix.trim().replace(/:$/, '')
    const i = newIri.trim()
    if (!p || !i) return
    addPrefix({ prefix: p, iri: i })
    setNewPrefix('')
    setNewIri('')
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-lg" style={{ width: 300 }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent/50 transition-colors rounded-t-lg"
      >
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Namespaces
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {open && (
        <>
          {/* Prefix list */}
          <div className="border-t border-border">
            {prefixes.map((p, i) => (
              <PrefixRow
                key={i}
                prefix={p}
                onUpdate={(updated) => updatePrefix(i, updated)}
                onRemove={() => removePrefix(i)}
              />
            ))}
          </div>

          {/* Add new prefix */}
          <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
            <input
              value={newPrefix}
              onChange={(e) => setNewPrefix(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="prefix"
              className="nodrag nopan w-16 shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
            />
            <span className="text-[10px] text-muted-foreground shrink-0">:</span>
            <input
              value={newIri}
              onChange={(e) => setNewIri(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="https://example.org/"
              className="nodrag nopan min-w-0 flex-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground outline-none focus:border-primary"
            />
            <button
              onClick={handleAdd}
              disabled={!newPrefix.trim() || !newIri.trim()}
              className="nodrag nopan flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground hover:opacity-80 disabled:opacity-30"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

interface PrefixRowProps {
  prefix: Prefix
  onUpdate: (p: Prefix) => void
  onRemove: () => void
}

function PrefixRow({ prefix, onUpdate, onRemove }: PrefixRowProps) {
  const [editingIri, setEditingIri] = useState(false)
  const [iriDraft, setIriDraft] = useState(prefix.iri)

  function commitIri() {
    const trimmed = iriDraft.trim()
    if (trimmed && trimmed !== prefix.iri) onUpdate({ ...prefix, iri: trimmed })
    else setIriDraft(prefix.iri)
    setEditingIri(false)
  }

  return (
    <div className="group flex items-center gap-1 px-2 py-1 hover:bg-accent/30">
      <span className="w-14 shrink-0 font-mono text-[10px] font-semibold text-primary">
        {prefix.prefix}:
      </span>

      {editingIri ? (
        <input
          autoFocus
          value={iriDraft}
          onChange={(e) => setIriDraft(e.target.value)}
          onBlur={commitIri}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitIri()
            if (e.key === 'Escape') { setIriDraft(prefix.iri); setEditingIri(false) }
          }}
          className="nodrag nopan min-w-0 flex-1 bg-transparent font-mono text-[10px] text-muted-foreground outline-none border-b border-primary"
        />
      ) : (
        <span
          onClick={() => { setIriDraft(prefix.iri); setEditingIri(true) }}
          title="Click to edit"
          className="nodrag nopan min-w-0 flex-1 cursor-text truncate font-mono text-[10px] text-muted-foreground hover:text-foreground"
        >
          {prefix.iri}
        </span>
      )}

      <button
        onClick={onRemove}
        className="nodrag nopan flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-destructive/20 group-hover:opacity-100"
      >
        <Trash2 className="h-2.5 w-2.5 text-destructive" />
      </button>
    </div>
  )
}
