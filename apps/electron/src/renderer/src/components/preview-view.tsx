import { useEffect, useMemo, useState } from 'react'
import { DirectedGraph } from 'graphology'
import { SigmaContainer, useLoadGraph, ControlsContainer, ZoomControl } from '@react-sigma/core'
import '@react-sigma/core/lib/style.css'
import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'

import { useRdfGraph } from '@/hooks/use-rdf-graph'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type SubView = 'table' | 'graph' | 'raw'

interface RdfTriple {
  subject: string
  predicate: string
  object: string
}

function attrFromHandle(handle: string | null | undefined): string {
  if (!handle) return '?'
  return handle.replace(/-left$|-right$/, '')
}

// Palette for dataset groups
const PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899',
  '#14b8a6', '#f97316', '#a855f7', '#06b6d4',
]

function useActualTriples(): RdfTriple[] {
  const { nodes, edges } = useRdfGraph()
  const { activeProject } = useWorkspaces()

  return useMemo<RdfTriple[]>(() => {
    if (!activeProject) return []
    const result: RdfTriple[] = []

    for (const edge of edges) {
      const sourceNode = nodes.find((n) => n.id === edge.source)
      const targetNode = nodes.find((n) => n.id === edge.target)
      if (!sourceNode || !targetNode) continue

      const sourceFile = activeProject.files.find((f) => f.path === sourceNode.data.filePath)
      const targetFile = activeProject.files.find((f) => f.path === targetNode.data.filePath)
      if (!sourceFile?.dataset || !targetFile?.dataset) continue

      const sourceAttr = attrFromHandle(edge.sourceHandle)
      const targetAttr = attrFromHandle(edge.targetHandle)
      const predicate = String(edge.label ?? edge.id)
      const sourceDataset = sourceNode.data.datasetName
      const targetDataset = targetNode.data.datasetName

      for (const sourceRow of sourceFile.dataset.data) {
        const subjectVal = String(sourceRow[sourceAttr] ?? '')
        const subject = `${sourceDataset}:${subjectVal}`

        // Inner join: target rows where targetRow[targetAttr] matches subjectVal
        const joined = targetFile.dataset.data.filter(
          (tr) => String(tr[targetAttr] ?? '') === subjectVal
        )
        const targetRows = joined.length > 0 ? joined : targetFile.dataset.data

        for (const targetRow of targetRows) {
          const objectVal = String(targetRow[targetAttr] ?? '')
          result.push({ subject, predicate, object: `${targetDataset}:${objectVal}` })
        }
      }
    }

    return result
  }, [nodes, edges, activeProject])
}

function triplesToTurtle(triples: RdfTriple[]): string {
  if (triples.length === 0) return ''
  const base = 'http://knowledge-graph-creator.local/'
  const lines: string[] = [
    `@prefix ex: <${base}> .`,
    '',
  ]

  // Group by subject for compact Turtle (semicolon chaining)
  const bySubject = new Map<string, { predicate: string; object: string }[]>()
  for (const t of triples) {
    const s = t.subject.replace(/[^A-Za-z0-9_.-]/g, '_')
    if (!bySubject.has(s)) bySubject.set(s, [])
    bySubject.get(s)!.push({ predicate: t.predicate, object: t.object.replace(/[^A-Za-z0-9_.-]/g, '_') })
  }

  for (const [subject, preds] of bySubject) {
    if (preds.length === 1) {
      lines.push(`ex:${subject} ex:${preds[0].predicate} ex:${preds[0].object} .`)
    } else {
      lines.push(`ex:${subject}`)
      preds.forEach(({ predicate, object }, i) => {
        const sep = i < preds.length - 1 ? ' ;' : ' .'
        lines.push(`    ex:${predicate} ex:${object}${sep}`)
      })
    }
    lines.push('')
  }

  return lines.join('\n')
}

function RawView({ triples }: { triples: RdfTriple[] }) {
  const turtle = useMemo(() => triplesToTurtle(triples), [triples])
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

// ── Sigma graph loader (must be a child of SigmaContainer) ──────────────────
function GraphLoader({ triples }: { triples: RdfTriple[] }) {
  const loadGraph = useLoadGraph()

  useEffect(() => {
    const graph = new DirectedGraph()

    // Collect unique nodes, grouped by dataset prefix for column layout + color
    const groupOrder: string[] = []
    const groupNodes = new Map<string, Set<string>>() // dataset → node IDs

    for (const t of triples) {
      const [subDs] = t.subject.split(':')
      const [objDs] = t.object.split(':')
      for (const [ds, key] of [[subDs, t.subject], [objDs, t.object]] as [string, string][]) {
        if (!groupNodes.has(ds)) {
          groupNodes.set(ds, new Set())
          groupOrder.push(ds)
        }
        groupNodes.get(ds)!.add(key)
      }
    }

    // Assign colors per dataset group
    const groupColor = new Map<string, string>()
    groupOrder.forEach((ds, i) => {
      groupColor.set(ds, PALETTE[i % PALETTE.length])
    })

    // Lay out nodes in columns (one column per dataset)
    const COL_GAP = 5
    const ROW_GAP = 2

    groupOrder.forEach((ds, colIdx) => {
      const ids = [...groupNodes.get(ds)!]
      const color = groupColor.get(ds)!
      const x = colIdx * COL_GAP
      ids.forEach((id, rowIdx) => {
        const [, ...rest] = id.split(':')
        const label = rest.join(':') || id
        const y = rowIdx * ROW_GAP - (ids.length * ROW_GAP) / 2
        if (!graph.hasNode(id)) {
          graph.addNode(id, { label, x, y, size: 6, color })
        }
      })
    })

    // Add edges (deduplicated)
    const edgeSeen = new Set<string>()
    for (const t of triples) {
      const key = `${t.subject}||${t.predicate}||${t.object}`
      if (edgeSeen.has(key)) continue
      edgeSeen.add(key)
      if (graph.hasNode(t.subject) && graph.hasNode(t.object)) {
        graph.addEdge(t.subject, t.object, {
          label: t.predicate,
          size: 2,
          color: '#6366f1',
        })
      }
    }

    loadGraph(graph)
  }, [triples, loadGraph])

  return null
}

// ── Main component ────────────────────────────────────────────────────────────
export function PreviewView() {
  const { nodes } = useRdfGraph()
  const [subView, setSubView] = useState<SubView>('table')
  const triples = useActualTriples()

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm font-medium">No graph to preview</p>
        <p className="text-xs">Define datasets in Data, then build relations in RDF.</p>
      </div>
    )
  }

  if (triples.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm font-medium">No connections defined</p>
        <p className="text-xs">Draw edges between datasets in the RDF tab to generate triples.</p>
      </div>
    )
  }

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
            {v === 'table' ? 'Table' : v === 'graph' ? 'Graph' : 'Raw'}
          </button>
        ))}
      </div>

      {subView === 'table' ? (
        <div className="flex-1 overflow-auto">
          <div className="px-4 py-2 text-xs text-muted-foreground border-b">
            {triples.length} triple{triples.length !== 1 ? 's' : ''} generated
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
                  <TableCell className="font-mono text-xs">{triple.predicate}</TableCell>
                  <TableCell className="font-mono text-xs">{triple.object}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : subView === 'graph' ? (
        <div className="flex-1 overflow-hidden">
          <SigmaContainer
            style={{ height: '100%', width: '100%' }}
            settings={{
              renderEdgeLabels: true,
              defaultEdgeType: 'arrow',
              labelSize: 11,
              edgeLabelSize: 10,
            }}
          >
            <GraphLoader triples={triples} />
            <ControlsContainer position="bottom-right">
              <ZoomControl />
            </ControlsContainer>
          </SigmaContainer>
        </div>
      ) : (
        <RawView triples={triples} />
      )}
    </div>
  )
}
