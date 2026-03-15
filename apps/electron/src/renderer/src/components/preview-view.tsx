import { useEffect, useMemo, useState } from 'react'
import { DirectedGraph } from 'graphology'
import { SigmaContainer, useLoadGraph, ControlsContainer, ZoomControl } from '@react-sigma/core'
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
    const subjectClass = new Map<string, string>()
    const classBuckets = new Map<string, string[]>()
    for (const t of triples) {
      if (t.predicate === 'rdf:type') {
        subjectClass.set(t.subject, t.object)
        const bucket = classBuckets.get(t.object) ?? []
        if (bucket.length < MAX_PER_CLASS) {
          bucket.push(t.subject)
          classBuckets.set(t.object, bucket)
        }
      }
    }

    const includedSubjects = new Set(
      [...classBuckets.values()].flat()
    )

    // Layout: classes as columns, instances as rows within each column
    const classOrder = [...classBuckets.keys()]
    const nodePos = new Map<string, { x: number; y: number }>()

    classOrder.forEach((cls, colIdx) => {
      const members = classBuckets.get(cls)!
      const color = classColor.get(cls) ?? PALETTE[colIdx % PALETTE.length]
      // Column header (class label) — shown via the first node's position
      const colX = colIdx * 7

      members.forEach((subj, rowIdx) => {
        const x = colX
        const y = rowIdx * 2.5 - (members.length * 2.5) / 2
        // Strip class prefix for compact label: "ex:User_42" → "42"
        const localPart = subj.replace(/^[^:]+:[^_]+_/, '')
        if (!graph.hasNode(subj)) {
          graph.addNode(subj, { label: localPart, x, y, size: 9, color })
          nodePos.set(subj, { x, y })
        }
      })
    })

    // Literal nodes + data property edges (capped per subject)
    const literalsPerSubject = new Map<string, number>()

    for (const t of triples) {
      if (!includedSubjects.has(t.subject) || !t.isLiteral) continue
      const count = literalsPerSubject.get(t.subject) ?? 0
      if (count >= MAX_LITERALS_PER_SUBJECT) continue

      const litNodeId = `__lit__${t.subject}||${t.predicate}`
      if (!graph.hasNode(litNodeId)) {
        const sp = nodePos.get(t.subject) ?? { x: 0, y: 0 }
        const offsetY = count * 1.6 - (MAX_LITERALS_PER_SUBJECT * 1.6) / 2
        graph.addNode(litNodeId, {
          label: extractLiteralValue(t.object),
          x: sp.x + 3.5,
          y: sp.y + offsetY,
          size: 5,
          color: '#22c55e',
        })
      }

      if (graph.hasNode(t.subject) && graph.hasNode(litNodeId)) {
        // Extract local predicate name for edge label
        const edgeLabel = t.predicate.includes(':') ? t.predicate.split(':')[1] : t.predicate
        graph.addEdge(t.subject, litNodeId, {
          label: edgeLabel,
          size: 1,
          color: '#22c55e88',
        })
      }

      literalsPerSubject.set(t.subject, count + 1)
    }

    // Object property edges (only between included subjects)
    const edgeSeen = new Set<string>()
    for (const t of triples) {
      if (t.isLiteral || t.predicate === 'rdf:type') continue
      if (!includedSubjects.has(t.subject) || !includedSubjects.has(t.object)) continue

      const key = `${t.subject}→${t.predicate}→${t.object}`
      if (edgeSeen.has(key)) continue
      edgeSeen.add(key)

      if (graph.hasNode(t.subject) && graph.hasNode(t.object)) {
        const edgeLabel = t.predicate.includes(':') ? t.predicate.split(':')[1] : t.predicate
        graph.addEdge(t.subject, t.object, {
          label: edgeLabel,
          size: 2,
          color: '#6366f1',
        })
      }
    }

    loadGraph(graph)
  }, [triples, rdfNodes, loadGraph])

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
                labelDensity: 0.8,
                labelGridCellSize: 80,
              }}
            >
              <InstanceGraphLoader triples={triples} />
              <ControlsContainer position="bottom-right">
                <ZoomControl />
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
