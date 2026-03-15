import { useEffect, useMemo, useRef, useState } from 'react'
import { DirectedGraph } from 'graphology'
import {
  SigmaContainer,
  useLoadGraph,
  useRegisterEvents,
  useSetSettings,
  useSigma,
  ControlsContainer,
  ZoomControl,
} from '@react-sigma/core'
import { LayoutForceAtlas2Control } from '@react-sigma/layout-forceatlas2'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import '@react-sigma/core/lib/style.css'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'

import { useRdfGraph } from '@/hooks/use-rdf-graph'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { usePrefixes } from '@/hooks/use-prefixes'
import { makeSubjectIri, escapeTurtleLiteral } from '@/lib/rdf-inference'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Prefix } from '@/types'

type SubView = 'table' | 'graph' | 'raw'

interface RdfTriple {
  subject: string
  predicate: string
  object: string
  isLiteral: boolean
}

function attrFromHandle(handle: string | null | undefined): string {
  if (!handle) return '?'
  return handle.replace(/-left$|-right$/, '')
}

const PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899',
  '#14b8a6', '#f97316', '#a855f7', '#06b6d4',
]

// Nodes shown per class before sampling kicks in
const MAX_PER_CLASS = 20
// Literal nodes shown per subject node
const MAX_LITERALS_PER_SUBJECT = 3

// ── Triple generation ─────────────────────────────────────────────────────────

function useActualTriples(): RdfTriple[] {
  const { nodes, edges } = useRdfGraph()
  const { activeProject } = useWorkspaces()

  return useMemo<RdfTriple[]>(() => {
    if (!activeProject) return []
    const result: RdfTriple[] = []

    // 1. Data property triples for each dataset node
    for (const node of nodes) {
      const { rdfClass, subjectColumn, columnMappings, filePath, attributes } = node.data
      if (!rdfClass || !subjectColumn || !columnMappings) continue

      const file = activeProject.files.find((f) => f.path === filePath)
      if (!file?.dataset) continue

      for (const row of file.dataset.data) {
        const subjectVal = String(row[subjectColumn] ?? '')
        if (!subjectVal) continue
        const subject = makeSubjectIri(rdfClass, subjectVal)

        result.push({ subject, predicate: 'rdf:type', object: rdfClass, isLiteral: false })

        for (const attr of attributes) {
          if (attr === subjectColumn) continue
          const mapping = columnMappings[attr]
          if (!mapping || mapping.omit) continue
          const val = row[attr]
          if (val === null || val === undefined || val === '') continue
          const escaped = escapeTurtleLiteral(String(val))
          result.push({
            subject,
            predicate: mapping.predicate,
            object: `"${escaped}"^^${mapping.datatype}`,
            isLiteral: true,
          })
        }
      }
    }

    // 2. Object property triples from edges
    for (const edge of edges) {
      const sourceNode = nodes.find((n) => n.id === edge.source)
      const targetNode = nodes.find((n) => n.id === edge.target)
      if (!sourceNode || !targetNode) continue

      const sourceFile = activeProject.files.find((f) => f.path === sourceNode.data.filePath)
      const targetFile = activeProject.files.find((f) => f.path === targetNode.data.filePath)
      if (!sourceFile?.dataset || !targetFile?.dataset) continue

      const sourceAttr = attrFromHandle(edge.sourceHandle)
      const targetAttr = attrFromHandle(edge.targetHandle)
      const forwardPredicate = String((edge.data?.forwardLabel as string) ?? edge.label ?? edge.id)
      const reversePredicate = String((edge.data?.reverseLabel as string) ?? forwardPredicate)

      const bidirectional = (edge.data?.bidirectional as boolean) ?? false

      for (const sourceRow of sourceFile.dataset.data) {
        const srcSubjectVal = String(sourceRow[sourceNode.data.subjectColumn] ?? '')
        if (!srcSubjectVal) continue
        const subject = makeSubjectIri(sourceNode.data.rdfClass, srcSubjectVal)

        const joinVal = String(sourceRow[sourceAttr] ?? '')
        const matched = targetFile.dataset.data.filter(
          (tr) => String(tr[targetAttr] ?? '') === joinVal
        )
        for (const targetRow of matched) {
          const tgtSubjectVal = String(targetRow[targetNode.data.subjectColumn] ?? '')
          if (!tgtSubjectVal) continue
          const object = makeSubjectIri(targetNode.data.rdfClass, tgtSubjectVal)
          result.push({ subject, predicate: forwardPredicate, object, isLiteral: false })
          if (bidirectional) {
            result.push({ subject: object, predicate: reversePredicate, object: subject, isLiteral: false })
          }
        }
      }
    }

    return result
  }, [nodes, edges, activeProject])
}

// ── Turtle serializer ─────────────────────────────────────────────────────────

function triplesToTurtle(triples: RdfTriple[], prefixes: Prefix[]): string {
  if (triples.length === 0) return ''
  const lines: string[] = []
  for (const p of prefixes) lines.push(`@prefix ${p.prefix}: <${p.iri}> .`)
  lines.push('')

  const bySubject = new Map<string, { predicate: string; object: string }[]>()
  for (const t of triples) {
    if (!bySubject.has(t.subject)) bySubject.set(t.subject, [])
    bySubject.get(t.subject)!.push({ predicate: t.predicate, object: t.object })
  }

  for (const [subject, preds] of bySubject) {
    if (preds.length === 1) {
      lines.push(`${subject} ${preds[0].predicate} ${preds[0].object} .`)
    } else {
      lines.push(`${subject}`)
      preds.forEach(({ predicate, object }, i) => {
        lines.push(`    ${predicate} ${object}${i < preds.length - 1 ? ' ;' : ' .'}`)
      })
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ── Raw view ──────────────────────────────────────────────────────────────────

function RawView({ triples }: { triples: RdfTriple[] }) {
  const { prefixes } = usePrefixes()
  const turtle = useMemo(() => triplesToTurtle(triples, prefixes), [triples, prefixes])
  return (
    <div className="flex-1 overflow-auto">
      <div className="px-4 py-2 text-xs text-muted-foreground border-b">
        Turtle (W3C RDF) · {triples.length} triple{triples.length !== 1 ? 's' : ''}
      </div>
      <CodeMirror
        value={turtle}
        readOnly
        theme={oneDark}
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
        style={{ fontSize: 12 }}
      />
    </div>
  )
}

// ── Instance graph (Sigma) ────────────────────────────────────────────────────
// Shows actual RDF entities: URI nodes (per class) + literal nodes (green) +
// object property edges (indigo) + data property edges (green).
// Sampled to MAX_PER_CLASS instances per class to stay readable.

function extractLiteralValue(literal: string): string {
  const m = literal.match(/^"([\s\S]*)"/)
  const raw = m ? m[1] : literal
  return raw.length > 18 ? raw.slice(0, 16) + '…' : raw
}

function edgeLocalLabel(predicate: string): string {
  return predicate.includes(':') ? predicate.split(':')[1] : predicate
}

function InstanceGraphLoader({ triples }: { triples: RdfTriple[] }) {
  const loadGraph = useLoadGraph()
  const { nodes: rdfNodes } = useRdfGraph()

  useEffect(() => {
    const graph = new DirectedGraph()

    // Build class → color map
    const classColor = new Map<string, string>()
    rdfNodes.forEach((n, i) => {
      classColor.set(n.data.rdfClass, PALETTE[i % PALETTE.length])
    })

    // Collect subjects per class, capped
    const classBuckets = new Map<string, string[]>()
    for (const t of triples) {
      if (t.predicate === 'rdf:type') {
        const bucket = classBuckets.get(t.object) ?? []
        if (bucket.length < MAX_PER_CLASS) {
          bucket.push(t.subject)
          classBuckets.set(t.object, bucket)
        }
      }
    }

    const includedSubjects = new Set([...classBuckets.values()].flat())

    // Add URI nodes with staggered initial positions (ForceAtlas2 needs valid x/y)
    const classOrder = [...classBuckets.keys()]
    classOrder.forEach((cls, colIdx) => {
      const members = classBuckets.get(cls)!
      const color = classColor.get(cls) ?? PALETTE[colIdx % PALETTE.length]
      const angleStep = (2 * Math.PI) / Math.max(members.length, 1)
      const radius = 4 + members.length * 0.8

      members.forEach((subj, rowIdx) => {
        const angle = rowIdx * angleStep + (colIdx * Math.PI) / classOrder.length
        const x = colIdx * 10 + Math.cos(angle) * radius
        const y = Math.sin(angle) * radius
        const localPart = subj.replace(/^[^:]+:[^_]+_/, '')
        if (!graph.hasNode(subj)) {
          graph.addNode(subj, { label: localPart, x, y, size: 9, color })
        }
      })
    })

    // Object property edges — detect bidirectional pairs and merge them
    const objectTriples = triples.filter(
      (t) =>
        !t.isLiteral &&
        t.predicate !== 'rdf:type' &&
        includedSubjects.has(t.subject) &&
        includedSubjects.has(t.object)
    )

    // Build a lookup: "subj||obj" → predicate label
    const forwardLabels = new Map<string, string>()
    for (const t of objectTriples) {
      const key = `${t.subject}||${t.object}`
      if (!forwardLabels.has(key)) forwardLabels.set(key, edgeLocalLabel(t.predicate))
    }

    // Add edges, merging A→B + B→A bidirectional pairs into one edge
    const pairsSeen = new Set<string>()
    for (const t of objectTriples) {
      const fwdKey = `${t.subject}||${t.object}`
      const revKey = `${t.object}||${t.subject}`

      const canonKey = fwdKey < revKey ? fwdKey : revKey
      if (pairsSeen.has(canonKey)) continue
      pairsSeen.add(canonKey)

      if (!graph.hasNode(t.subject) || !graph.hasNode(t.object)) continue

      const isBidirectional = forwardLabels.has(revKey)
      const fwdLabel = forwardLabels.get(fwdKey) ?? edgeLocalLabel(t.predicate)
      const label = isBidirectional
        ? `${fwdLabel} ⇄ ${forwardLabels.get(revKey)}`
        : fwdLabel

      graph.addEdge(t.subject, t.object, {
        label,
        forceLabel: true,
        size: 2,
        color: isBidirectional ? '#a855f7' : '#6366f1',
      })
    }

    // ── Phase 1: run ForceAtlas2 on URI nodes only ────────────────────────────
    // Literal nodes are excluded so they don't distort the layout of URI nodes.
    const fa2Settings = forceAtlas2.inferSettings(graph)
    forceAtlas2.assign(graph, {
      iterations: 200,
      settings: { ...fa2Settings, gravity: 1, scalingRatio: 6, adjustSizes: true },
    })

    // ── Phase 2: add literal nodes positioned around their settled subjects ───
    const literalsPerSubject = new Map<string, number>()
    for (const t of triples) {
      if (!includedSubjects.has(t.subject) || !t.isLiteral) continue
      const count = literalsPerSubject.get(t.subject) ?? 0
      if (count >= MAX_LITERALS_PER_SUBJECT) continue

      const litNodeId = `__lit__${t.subject}||${t.predicate}`
      if (!graph.hasNode(litNodeId)) {
        const sx = graph.getNodeAttribute(t.subject, 'x') as number
        const sy = graph.getNodeAttribute(t.subject, 'y') as number
        // Spread literals in a fan around the subject node
        const spreadAngle = ((count + 0.5) / MAX_LITERALS_PER_SUBJECT) * Math.PI * 2
        graph.addNode(litNodeId, {
          label: extractLiteralValue(t.object),
          x: sx + Math.cos(spreadAngle) * 4,
          y: sy + Math.sin(spreadAngle) * 4,
          size: 5,
          color: '#22c55e',
        })
      }

      if (graph.hasNode(t.subject) && graph.hasNode(litNodeId)) {
        graph.addEdge(t.subject, litNodeId, {
          label: edgeLocalLabel(t.predicate),
          forceLabel: true,
          size: 1,
          color: '#22c55e88',
        })
      }

      literalsPerSubject.set(t.subject, count + 1)
    }

    loadGraph(graph)
  }, [triples, rdfNodes, loadGraph])

  return null
}

// ── Graph search ─────────────────────────────────────────────────────────────

function GraphSearch() {
  const sigma = useSigma()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selectedRef = useRef<string | null>(null)

  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const graph = sigma.getGraph()
    return graph
      .nodes()
      .map((n) => ({ id: n, label: (graph.getNodeAttribute(n, 'label') as string) || n }))
      .filter(({ label }) => label.toLowerCase().includes(q))
      .slice(0, 8)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sigma])

  function selectNode(nodeId: string) {
    const graph = sigma.getGraph()
    if (selectedRef.current) graph.setNodeAttribute(selectedRef.current, 'highlighted', false)
    graph.setNodeAttribute(nodeId, 'highlighted', true)
    selectedRef.current = nodeId

    const nodeData = sigma.getNodeDisplayData(nodeId)
    if (nodeData) {
      sigma.getCamera().animate(
        { x: nodeData.x, y: nodeData.y, ratio: 0.15 },
        { duration: 500 }
      )
    }
    setQuery('')
    setOpen(false)
  }

  function clearSelection() {
    if (selectedRef.current) {
      sigma.getGraph().setNodeAttribute(selectedRef.current, 'highlighted', false)
      selectedRef.current = null
    }
    setQuery('')
    setOpen(false)
  }

  // Clear on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') clearSelection() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigma])

  return (
    <div className="absolute top-3 right-3 z-10 w-52">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Search nodes…"
          className="w-full rounded border border-border bg-card/90 px-3 py-1.5 pr-7 text-xs text-foreground placeholder:text-muted-foreground backdrop-blur-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {(query || selectedRef.current) && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onMouseDown={(e) => { e.preventDefault(); clearSelection() }}
          >
            ✕
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-auto rounded border border-border bg-card/95 py-1 shadow-lg backdrop-blur-sm">
          {suggestions.map(({ id, label }) => (
            <li
              key={id}
              onMouseDown={(e) => { e.preventDefault(); selectNode(id) }}
              className="cursor-pointer px-3 py-1.5 text-xs text-foreground hover:bg-accent"
            >
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Interaction manager (drag, hover highlight, rect-select + group drag) ─────

type SelectionRect = { x1: number; y1: number; x2: number; y2: number }

function InteractionManager({
  isSelectMode,
  setIsSelectMode,
}: {
  isSelectMode: boolean
  setIsSelectMode: (v: boolean | ((prev: boolean) => boolean)) => void
}) {
  const sigma = useSigma()
  const registerEvents = useRegisterEvents()
  const setSettings = useSetSettings()

  // ── reactive state (drives re-render for overlay & settings) ────────────────
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set())
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)

  // ── refs (readable inside event callbacks without stale closures) ───────────
  const selectModeRef = useRef(false)
  const selectedRef = useRef<Set<string>>(new Set())
  const hoveredRef = useRef<string | null>(null)
  const rectStartRef = useRef<{ x: number; y: number } | null>(null)
  const selectionRectRef = useRef<SelectionRect | null>(null)
  // single-node drag
  const dragNodeRef = useRef<string | null>(null)
  const isDraggingSingleRef = useRef(false)
  // group drag
  const isDraggingGroupRef = useRef(false)
  const groupDragStartRef = useRef<{ x: number; y: number } | null>(null)
  const groupStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  // keep refs in sync with state
  useEffect(() => { selectModeRef.current = isSelectMode }, [isSelectMode])
  useEffect(() => { selectedRef.current = selectedNodes }, [selectedNodes])
  useEffect(() => { hoveredRef.current = hoveredNode }, [hoveredNode])

  // cursor feedback
  useEffect(() => {
    const el = sigma.getContainer()
    el.style.cursor = isSelectMode ? 'crosshair' : ''
    return () => { el.style.cursor = '' }
  }, [isSelectMode, sigma])

  // ── unified nodeReducer / edgeReducer ───────────────────────────────────────
  useEffect(() => {
    const graph = sigma.getGraph()
    const sel = selectedNodes
    const hov = hoveredNode

    // nothing active → clear reducers
    if (sel.size === 0 && !hov) {
      setSettings({ nodeReducer: null, edgeReducer: null })
      return
    }

    // precompute hovered neighbourhood once (captured in closure, not recomputed per node)
    const hovNeighbors = hov ? new Set([hov, ...graph.neighbors(hov)]) : null
    const hovEdges = hov ? new Set(graph.edges(hov)) : null

    setSettings({
      nodeReducer: (node, data) => {
        if (sel.size > 0 && sel.has(node)) return { ...data, highlighted: true, zIndex: 1 }
        if (hovNeighbors?.has(node)) return { ...data, highlighted: node === hov, zIndex: 1 }
        return { ...data, color: '#1e293b', label: '', zIndex: 0 }
      },
      edgeReducer: (edge, data) => {
        if (hovEdges?.has(edge)) return { ...data, zIndex: 1 }
        return { ...data, color: '#1e293b', label: '', zIndex: 0 }
      },
    })
  }, [selectedNodes, hoveredNode, sigma, setSettings])

  // ── event registration (runs once; all mutable state accessed via refs) ─────
  useEffect(() => {
    registerEvents({
      // hover
      enterNode: (e) => setHoveredNode(e.node),
      leaveNode: () => setHoveredNode(null),

      downNode: (e) => {
        e.preventSigmaDefault()
        if (selectModeRef.current) {
          const nodeId = e.node
          if (selectedRef.current.has(nodeId)) {
            // start group drag
            isDraggingGroupRef.current = true
            groupDragStartRef.current = sigma.viewportToGraph(e.event)
            const positions = new Map<string, { x: number; y: number }>()
            for (const n of selectedRef.current) {
              positions.set(n, {
                x: sigma.getGraph().getNodeAttribute(n, 'x') as number,
                y: sigma.getGraph().getNodeAttribute(n, 'y') as number,
              })
            }
            groupStartPositionsRef.current = positions
          } else {
            // toggle-select individual node
            setSelectedNodes((prev) => {
              const next = new Set(prev)
              next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId)
              return next
            })
          }
        } else {
          // pan mode: single-node drag
          isDraggingSingleRef.current = true
          dragNodeRef.current = e.node
          sigma.getGraph().setNodeAttribute(e.node, 'highlighted', true)
        }
      },

      downStage: (e) => {
        if (!selectModeRef.current) return
        rectStartRef.current = { x: e.event.x, y: e.event.y }
        const rect: SelectionRect = { x1: e.event.x, y1: e.event.y, x2: e.event.x, y2: e.event.y }
        selectionRectRef.current = rect
        setSelectionRect(rect)
        e.preventSigmaDefault()
      },

      mousemovebody: (e) => {
        if (isDraggingSingleRef.current && dragNodeRef.current) {
          const pos = sigma.viewportToGraph(e)
          sigma.getGraph().setNodeAttribute(dragNodeRef.current, 'x', pos.x)
          sigma.getGraph().setNodeAttribute(dragNodeRef.current, 'y', pos.y)
          e.preventSigmaDefault()
          e.original.preventDefault()
          e.original.stopPropagation()
          return
        }

        if (isDraggingGroupRef.current && groupDragStartRef.current) {
          const cur = sigma.viewportToGraph(e)
          const dx = cur.x - groupDragStartRef.current.x
          const dy = cur.y - groupDragStartRef.current.y
          const graph = sigma.getGraph()
          for (const [nodeId, start] of groupStartPositionsRef.current) {
            graph.setNodeAttribute(nodeId, 'x', start.x + dx)
            graph.setNodeAttribute(nodeId, 'y', start.y + dy)
          }
          e.preventSigmaDefault()
          e.original.preventDefault()
          return
        }

        if (rectStartRef.current) {
          const rect: SelectionRect = { x1: rectStartRef.current.x, y1: rectStartRef.current.y, x2: e.x, y2: e.y }
          selectionRectRef.current = rect
          setSelectionRect(rect)
          e.preventSigmaDefault()
          e.original.preventDefault()
        }
      },

      mouseup: () => {
        // end single-node drag
        if (dragNodeRef.current) {
          sigma.getGraph().setNodeAttribute(dragNodeRef.current, 'highlighted', false)
        }
        isDraggingSingleRef.current = false
        dragNodeRef.current = null

        // end group drag
        isDraggingGroupRef.current = false
        groupDragStartRef.current = null
        groupStartPositionsRef.current = new Map()

        // finalise rectangle selection
        const rect = selectionRectRef.current
        if (rect && rectStartRef.current) {
          const minX = Math.min(rect.x1, rect.x2), maxX = Math.max(rect.x1, rect.x2)
          const minY = Math.min(rect.y1, rect.y2), maxY = Math.max(rect.y1, rect.y2)
          const graph = sigma.getGraph()
          const inside = graph.nodes().filter((n) => {
            const displayData = sigma.getNodeDisplayData(n)
            if (!displayData || displayData.hidden) return false
            // compare in viewport pixels — same space as the rect coords
            const vp = sigma.framedGraphToViewport(displayData)
            return vp.x >= minX && vp.x <= maxX && vp.y >= minY && vp.y <= maxY
          })
          setSelectedNodes(new Set(inside))
        }
        rectStartRef.current = null
        selectionRectRef.current = null
        setSelectionRect(null)
      },

      mouseleave: () => {
        if (dragNodeRef.current) sigma.getGraph().setNodeAttribute(dragNodeRef.current, 'highlighted', false)
        isDraggingSingleRef.current = false
        dragNodeRef.current = null
      },

      // click empty stage → clear selection
      clickStage: () => {
        if (selectModeRef.current && !isDraggingGroupRef.current) {
          setSelectedNodes(new Set())
        }
      },
    })
  }, [registerEvents, sigma, setSettings])

  return (
    <>
      {/* Keyboard shortcut: Escape exits select mode */}
      {isSelectMode && (
        <EscapeListener onEscape={() => { setIsSelectMode(false); setSelectedNodes(new Set()) }} />
      )}

      {/* Rectangle selection overlay */}
      {selectionRect && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: Math.min(selectionRect.x1, selectionRect.x2),
            top: Math.min(selectionRect.y1, selectionRect.y2),
            width: Math.abs(selectionRect.x2 - selectionRect.x1),
            height: Math.abs(selectionRect.y2 - selectionRect.y1),
            border: '1.5px dashed #6366f1',
            backgroundColor: 'rgba(99,102,241,0.08)',
          }}
        />
      )}

      {/* Selection count badge */}
      {selectedNodes.size > 0 && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded border border-indigo-700 bg-card/90 px-2 py-0.5 text-[10px] font-mono text-indigo-400 backdrop-blur-sm">
          {selectedNodes.size} node{selectedNodes.size !== 1 ? 's' : ''} selected
        </div>
      )}
    </>
  )
}

function EscapeListener({ onEscape }: { onEscape: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onEscape])
  return null
}

function useGraphStats(triples: RdfTriple[]) {
  return useMemo(() => {
    const totalSubjects = new Set(triples.filter(t => t.predicate === 'rdf:type').map(t => t.subject)).size
    const classBuckets = new Map<string, number>()
    for (const t of triples) {
      if (t.predicate === 'rdf:type') {
        classBuckets.set(t.object, (classBuckets.get(t.object) ?? 0) + 1)
      }
    }
    const shownSubjects = [...classBuckets.values()].reduce(
      (sum, count) => sum + Math.min(count, MAX_PER_CLASS),
      0
    )
    return { totalSubjects, shownSubjects, isSampled: shownSubjects < totalSubjects }
  }, [triples])
}

// ── Main component ────────────────────────────────────────────────────────────

export function PreviewView() {
  const { nodes } = useRdfGraph()
  const [subView, setSubView] = useState<SubView>('table')
  const [isSelectMode, setIsSelectMode] = useState(false)
  const triples = useActualTriples()
  const { totalSubjects, shownSubjects, isSampled } = useGraphStats(triples)

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm font-medium">No graph to preview</p>
        <p className="text-xs">Define datasets in Data, then build relations in RDF.</p>
      </div>
    )
  }

  const typeTriples = triples.filter((t) => t.predicate === 'rdf:type')
  const literalTriples = triples.filter((t) => t.isLiteral)
  const relationTriples = triples.filter((t) => !t.isLiteral && t.predicate !== 'rdf:type')

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sub-view toggle */}
      <div className="flex shrink-0 items-stretch border-b">
        {(['table', 'graph', 'raw'] as SubView[]).map((v) => (
          <button
            key={v}
            onClick={() => setSubView(v)}
            className={cn(
              'px-5 py-2 text-sm font-medium border-b-2 transition-colors',
              subView === v
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {v === 'table' ? 'Table' : v === 'graph' ? 'Graph' : 'Turtle'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 pr-4 text-xs text-muted-foreground">
          <span className="text-amber-400">{typeTriples.length} types</span>
          <span className="text-emerald-400">{literalTriples.length} literals</span>
          <span className="text-indigo-400">{relationTriples.length} relations</span>
        </div>
      </div>

      {subView === 'table' ? (
        <div className="flex-1 overflow-auto">
          <div className="px-4 py-2 text-xs text-muted-foreground border-b">
            {triples.length} triple{triples.length !== 1 ? 's' : ''} · {nodes.length} dataset{nodes.length !== 1 ? 's' : ''}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Predicate</TableHead>
                <TableHead>Object</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {triples.map((triple, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{triple.subject}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <span
                      className={
                        triple.predicate === 'rdf:type'
                          ? 'text-amber-400'
                          : triple.isLiteral
                            ? 'text-emerald-400'
                            : 'text-indigo-400'
                      }
                    >
                      {triple.predicate}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <span className={triple.isLiteral ? 'text-emerald-300' : ''}>
                      {triple.object}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : subView === 'graph' ? (
        <div className="relative flex-1 overflow-hidden">
          {triples.length > 0 ? (
            <SigmaContainer
              style={{ height: '100%', width: '100%' }}
              settings={{
                renderEdgeLabels: true,
                defaultEdgeType: 'arrow',
                labelSize: 11,
                edgeLabelSize: 9,
                labelColor: { color: '#94a3b8' },
                edgeLabelColor: { color: '#94a3b8' },
                labelDensity: 1,
                labelGridCellSize: 60,
                defaultNodeType: 'circle',
                zIndex: true,
              }}
            >
              <InstanceGraphLoader triples={triples} />
              <GraphSearch />
              <InteractionManager isSelectMode={isSelectMode} setIsSelectMode={setIsSelectMode} />
              <ControlsContainer position="bottom-right">
                <ZoomControl />
                <LayoutForceAtlas2Control
                  settings={{ gravity: 1, scalingRatio: 6, adjustSizes: true }}
                />
                <button
                  title={isSelectMode ? 'Exit select mode (Esc)' : 'Select mode — draw a rectangle to select nodes'}
                  onClick={() => setIsSelectMode((m) => !m)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center transition-colors',
                    isSelectMode ? 'text-primary' : 'text-[#999] hover:text-foreground'
                  )}
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="1.5" y="1.5" width="5" height="5" strokeDasharray="2 1.5" />
                    <rect x="9.5" y="1.5" width="5" height="5" strokeDasharray="2 1.5" />
                    <rect x="1.5" y="9.5" width="5" height="5" strokeDasharray="2 1.5" />
                    <rect x="9.5" y="9.5" width="5" height="5" strokeDasharray="2 1.5" />
                  </svg>
                </button>
              </ControlsContainer>
            </SigmaContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Connect datasets in the RDF tab to generate the graph.
            </div>
          )}

          {/* Legend + sampling notice */}
          <div className="pointer-events-none absolute bottom-12 left-3 flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-2 text-[10px]">
              <span className="flex items-center gap-1 rounded border border-indigo-700 bg-card/80 px-1.5 py-0.5 font-mono text-indigo-400">
                <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
                URI node
              </span>
              <span className="flex items-center gap-1 rounded border border-emerald-700 bg-card/80 px-1.5 py-0.5 font-mono text-emerald-400">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Literal
              </span>
              <span className="flex items-center gap-1 rounded border border-indigo-800 bg-card/80 px-1.5 py-0.5 font-mono text-indigo-400">
                ── Object property
              </span>
              <span className="flex items-center gap-1 rounded border border-purple-800 bg-card/80 px-1.5 py-0.5 font-mono text-purple-400">
                ── Bidirectional ⇄
              </span>
              <span className="flex items-center gap-1 rounded border border-emerald-800 bg-card/80 px-1.5 py-0.5 font-mono text-emerald-400">
                ── Data property
              </span>
            </div>
            {isSampled && (
              <span className="rounded border border-amber-700 bg-card/80 px-1.5 py-0.5 text-[10px] font-mono text-amber-400">
                Showing {shownSubjects} of {totalSubjects} entities (max {MAX_PER_CLASS} per class)
              </span>
            )}
          </div>
        </div>
      ) : (
        <RawView triples={triples} />
      )}
    </div>
  )
}
