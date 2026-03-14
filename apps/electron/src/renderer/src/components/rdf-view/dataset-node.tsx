import { useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import { KeyRound, ChevronDown, EyeOff } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRdfGraph } from '@/hooks/use-rdf-graph'
import type { RdfNodeData, XsdDatatype } from '@/types'
import { XSD_DATATYPES, DATATYPE_LABELS } from '@/types'

type DatasetNodeType = Node<RdfNodeData>

// Short label + colour for each datatype badge
const DATATYPE_COLORS: Record<XsdDatatype, string> = {
  'xsd:string':   'text-slate-400 border-slate-600',
  'xsd:integer':  'text-blue-400 border-blue-700',
  'xsd:decimal':  'text-sky-400 border-sky-700',
  'xsd:boolean':  'text-purple-400 border-purple-700',
  'xsd:dateTime': 'text-orange-400 border-orange-700',
  'xsd:date':     'text-amber-400 border-amber-700',
  'xsd:anyURI':   'text-teal-400 border-teal-700',
}

// ── Inline editable text cell ─────────────────────────────────────────────────
interface InlineEditProps {
  value: string
  onCommit: (v: string) => void
  className?: string
  inputClassName?: string
  placeholder?: string
}

function InlineEdit({ value, onCommit, className = '', inputClassName = '', placeholder }: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 10)
    }
  }, [editing])

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onCommit(trimmed)
    else setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
          e.stopPropagation()
        }}
        onClick={(e) => e.stopPropagation()}
        className={`nodrag nopan bg-transparent outline-none border-b border-primary ${inputClassName}`}
      />
    )
  }

  return (
    <span
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      title="Click to edit"
      className={`cursor-text hover:opacity-80 ${className}`}
    >
      {value}
    </span>
  )
}

// ── Datatype badge + dropdown ─────────────────────────────────────────────────
interface DatatypeBadgeProps {
  value: XsdDatatype
  onChange: (dt: XsdDatatype) => void
}

function DatatypeBadge({ value, onChange }: DatatypeBadgeProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`nodrag nopan flex items-center gap-0.5 rounded border px-1 py-0 font-mono text-[9px] leading-4 transition-opacity hover:opacity-80 ${DATATYPE_COLORS[value]}`}
        >
          {DATATYPE_LABELS[value]}
          <ChevronDown className="h-2 w-2 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[110px]">
        {XSD_DATATYPES.map((dt) => (
          <DropdownMenuItem
            key={dt}
            onClick={() => onChange(dt)}
            className={`font-mono text-xs ${dt === value ? 'font-semibold' : ''}`}
          >
            <span className={`mr-2 ${DATATYPE_COLORS[dt]}`}>{DATATYPE_LABELS[dt]}</span>
            {dt}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Main node component ───────────────────────────────────────────────────────
export function DatasetNode({ id, data, selected }: NodeProps<DatasetNodeType>) {
  const { updateNodeRdfClass, updateNodeSubjectColumn, updateNodeColumnMapping } = useRdfGraph()

  return (
    <div
      className={`min-w-[300px] max-w-[380px] rounded-lg border bg-card shadow-md transition-shadow ${
        selected ? 'border-primary shadow-lg' : 'border-border'
      }`}
    >
      {/* ── Header ── */}
      <div className="rounded-t-lg border-b border-border bg-muted/40 px-3 py-1.5">
        <p className="truncate font-mono text-[10px] text-muted-foreground">{data.datasetName}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {/* RDF class (inline editable) */}
          <InlineEdit
            value={data.rdfClass}
            onCommit={(v) => updateNodeRdfClass(id, v)}
            className="font-mono text-xs font-semibold text-primary"
            inputClassName="font-mono text-xs font-semibold text-primary w-36"
            placeholder="ex:ClassName"
          />

          <span className="text-[10px] text-muted-foreground/50">·</span>

          {/* Subject column selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="nodrag nopan flex items-center gap-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                <KeyRound className="h-2.5 w-2.5 text-amber-400" />
                {data.subjectColumn}
                <ChevronDown className="h-2.5 w-2.5 opacity-40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[120px]">
              {data.attributes.map((attr) => (
                <DropdownMenuItem
                  key={attr}
                  onClick={() => updateNodeSubjectColumn(id, attr)}
                  className={`font-mono text-xs ${attr === data.subjectColumn ? 'font-semibold text-primary' : ''}`}
                >
                  {attr}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Column rows ── */}
      <div className="py-1">
        {data.attributes.length === 0 ? (
          <p className="px-3 py-1 text-[10px] text-muted-foreground">No attributes</p>
        ) : (
          data.attributes.map((attr) => {
            const mapping = data.columnMappings?.[attr]
            const isSubject = attr === data.subjectColumn
            const isOmitted = mapping?.omit ?? false

            return (
              <div
                key={attr}
                className={`group relative flex items-center gap-1.5 px-3 py-0.5 transition-opacity ${
                  isOmitted ? 'opacity-35' : ''
                }`}
              >
                {/* Left handle */}
                <Handle
                  type="source"
                  position={Position.Left}
                  id={`${attr}-left`}
                  className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-primary !bg-background"
                  style={{ left: -5 }}
                />

                {/* Subject key icon */}
                <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                  {isSubject && <KeyRound className="h-2.5 w-2.5 text-amber-400 opacity-70" />}
                </span>

                {/* Column name */}
                <span className="w-20 shrink-0 truncate font-mono text-[10px] text-muted-foreground">
                  {attr}
                </span>

                {/* Predicate (inline editable) */}
                <div className="min-w-0 flex-1">
                  {mapping ? (
                    <InlineEdit
                      value={mapping.predicate}
                      onCommit={(v) => updateNodeColumnMapping(id, attr, { predicate: v })}
                      className="font-mono text-[10px] text-indigo-400"
                      inputClassName="font-mono text-[10px] text-indigo-400 w-full"
                      placeholder="ex:predicate"
                    />
                  ) : (
                    <span className="font-mono text-[10px] text-muted-foreground/40">—</span>
                  )}
                </div>

                {/* Datatype badge */}
                {mapping && !isSubject && (
                  <DatatypeBadge
                    value={mapping.datatype}
                    onChange={(dt) => updateNodeColumnMapping(id, attr, { datatype: dt })}
                  />
                )}

                {/* Omit toggle (appears on hover for non-subject columns) */}
                {mapping && !isSubject && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      updateNodeColumnMapping(id, attr, { omit: !isOmitted })
                    }}
                    title={isOmitted ? 'Include column' : 'Omit column'}
                    className={`nodrag nopan flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 ${
                      isOmitted ? '!opacity-60' : ''
                    }`}
                  >
                    <EyeOff className="h-2.5 w-2.5 text-muted-foreground" />
                  </button>
                )}

                {/* Spacer when no omit button shown */}
                {(!mapping || isSubject) && <span className="h-4 w-4 shrink-0" />}

                {/* Right handle */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`${attr}-right`}
                  className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-primary !bg-background"
                  style={{ right: -5 }}
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
