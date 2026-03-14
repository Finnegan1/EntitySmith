import { useEffect, useMemo, useState } from 'react'
import { DirectedGraph } from 'graphology'
import { SigmaContainer, useLoadGraph, ControlsContainer, ZoomControl } from '@react-sigma/core'
import '@react-sigma/core/lib/style.css'

import { useRdfGraph } from '@/hooks/use-rdf-graph'
import { useWorkspaces } from '@/hooks/use-workspaces'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RdfCanvas } from './rdf-view/rdf-canvas'

type RdfSubView = 'canvas' | 'schema' | 'ontology'

// ── Shared palette ────────────────────────────────────────────────────────────

const PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899',
  '#14b8a6', '#f97316', '#a855f7', '#06b6d4',
]

// ── Schema graph ──────────────────────────────────────────────────────────────

interface SchemaNode {
  id: string
  rdfClass: string
  instanceCount: number
  color: string
}

interface SchemaEdge {
  source: string
  target: string
  predicate: string
}

function SchemaGraphLoader({
  schemaNodes,
  schemaEdges,
}: {
  schemaNodes: SchemaNode[]
  schemaEdges: SchemaEdge[]
}) {
  const loadGraph = useLoadGraph()

  useEffect(() => {
    const graph = new DirectedGraph()

    schemaNodes.forEach((sn, i) => {
      const cols = Math.max(1, Math.ceil(Math.sqrt(schemaNodes.length)))
      const row = Math.floor(i / cols)
      const col = i % cols
      if (!graph.hasNode(sn.rdfClass)) {
        graph.addNode(sn.rdfClass, {
          label: `${sn.rdfClass}  (${sn.instanceCount})`,
          x: col * 5,
          y: row * 5,
          size: Math.max(12, Math.min(22, 12 + Math.log10(sn.instanceCount + 1) * 5)),
          color: sn.color,
        })
      }
    })

    const seen = new Set<string>()
    for (const se of schemaEdges) {
      const key = `${se.source}|${se.predicate}|${se.target}`
      if (seen.has(key)) continue
      seen.add(key)
      if (graph.hasNode(se.source) && graph.hasNode(se.target)) {
        graph.addEdge(se.source, se.target, {
          label: se.predicate,
          size: 2,
          color: '#6366f1',
        })
      }
    }

    loadGraph(graph)
  }, [schemaNodes, schemaEdges, loadGraph])

  return null
}

function useSchemaGraph() {
  const { nodes, edges } = useRdfGraph()
  const { activeProject } = useWorkspaces()

  return useMemo(() => {
    const schemaNodes: SchemaNode[] = nodes.map((n, i) => {
      const file = activeProject?.files.find((f) => f.path === n.data.filePath)
      return {
        id: n.id,
        rdfClass: n.data.rdfClass || n.data.datasetName,
        instanceCount: file?.dataset?.data.length ?? 0,
        color: PALETTE[i % PALETTE.length],
      }
    })

    const schemaEdges: SchemaEdge[] = edges.flatMap((edge) => {
      const src = nodes.find((n) => n.id === edge.source)
      const tgt = nodes.find((n) => n.id === edge.target)
      if (!src || !tgt) return []
      return [{
        source: src.data.rdfClass || src.data.datasetName,
        target: tgt.data.rdfClass || tgt.data.datasetName,
        predicate: String(edge.label ?? edge.id),
      }]
    })

    return { schemaNodes, schemaEdges }
  }, [nodes, edges, activeProject])
}

function SchemaGraphView() {
  const { schemaNodes, schemaEdges } = useSchemaGraph()

  if (schemaNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Add datasets to the canvas to see the schema graph.
      </div>
    )
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <SigmaContainer
        style={{ height: '100%', width: '100%' }}
        settings={{
          renderEdgeLabels: true,
          defaultEdgeType: 'arrow',
          labelSize: 13,
          edgeLabelSize: 11,
          labelColor: { color: '#94a3b8' },
        }}
      >
        <SchemaGraphLoader schemaNodes={schemaNodes} schemaEdges={schemaEdges} />
        <ControlsContainer position="bottom-right">
          <ZoomControl />
        </ControlsContainer>
      </SigmaContainer>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-12 left-3 flex flex-wrap gap-2 text-[10px]">
        {schemaNodes.map((sn) => (
          <span
            key={sn.id}
            className="flex items-center gap-1 rounded border bg-card/80 px-1.5 py-0.5 font-mono"
            style={{ borderColor: sn.color, color: sn.color }}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: sn.color }} />
            {sn.rdfClass} ({sn.instanceCount})
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Ontology table ────────────────────────────────────────────────────────────

interface OntologyTriple {
  subject: string
  predicate: string
  object: string
  kind: 'type' | 'dataProperty' | 'objectProperty' | 'label'
}

function attrFromHandle(handle: string | null | undefined): string {
  if (!handle) return '?'
  return handle.replace(/-left$|-right$/, '')
}

function OntologyTable() {
  const { nodes, edges } = useRdfGraph()

  const triples = useMemo<OntologyTriple[]>(() => {
    const result: OntologyTriple[] = []

    for (const node of nodes) {
      const { rdfClass, datasetName, attributes, columnMappings, subjectColumn } = node.data

      result.push({ subject: rdfClass, predicate: 'rdf:type', object: 'rdfs:Class', kind: 'type' })
      result.push({ subject: rdfClass, predicate: 'rdfs:label', object: `"${datasetName}"`, kind: 'label' })

      for (const attr of attributes) {
        if (attr === subjectColumn) continue
        const mapping = columnMappings?.[attr]
        if (!mapping || mapping.omit) continue
        result.push({ subject: mapping.predicate, predicate: 'rdfs:domain', object: rdfClass, kind: 'dataProperty' })
        result.push({ subject: mapping.predicate, predicate: 'rdfs:range', object: mapping.datatype, kind: 'dataProperty' })
      }
    }

    for (const edge of edges) {
      const sourceNode = nodes.find((n) => n.id === edge.source)
      const targetNode = nodes.find((n) => n.id === edge.target)
      const sourceAttr = attrFromHandle(edge.sourceHandle)
      const targetAttr = attrFromHandle(edge.targetHandle)
      const predicate = String(edge.label ?? edge.id)
      const sourceClass = sourceNode?.data.rdfClass ?? edge.source
      const targetClass = targetNode?.data.rdfClass ?? edge.target

      result.push({ subject: predicate, predicate: 'rdf:type', object: 'owl:ObjectProperty', kind: 'type' })
      result.push({ subject: predicate, predicate: 'rdfs:domain', object: sourceClass, kind: 'objectProperty' })
      result.push({ subject: predicate, predicate: 'rdfs:range', object: targetClass, kind: 'objectProperty' })
      result.push({ subject: predicate, predicate: 'rdfs:comment', object: `"join ${sourceAttr} → ${targetAttr}"`, kind: 'label' })
    }

    return result
  }, [nodes, edges])

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm font-medium">No schema defined yet</p>
        <p className="text-xs">Add datasets to the canvas and connect them.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-4 py-2 text-xs text-muted-foreground border-b">
        Ontology schema — {triples.length} assertion{triples.length !== 1 ? 's' : ''}
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
              <TableCell className="font-mono text-xs">
                <span
                  className={
                    triple.kind === 'type'
                      ? 'text-primary'
                      : triple.kind === 'objectProperty'
                        ? 'text-indigo-400'
                        : triple.kind === 'dataProperty'
                          ? 'text-emerald-400'
                          : ''
                  }
                >
                  {triple.subject}
                </span>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{triple.predicate}</TableCell>
              <TableCell className="font-mono text-xs">{triple.object}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ── RdfView shell ─────────────────────────────────────────────────────────────

export function RdfView() {
  const [subView, setSubView] = useState<RdfSubView>('canvas')

  const TAB_LABELS: Record<RdfSubView, string> = {
    canvas: 'Canvas',
    schema: 'Schema Graph',
    ontology: 'Ontology',
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-stretch border-b">
        {(['canvas', 'schema', 'ontology'] as RdfSubView[]).map((v) => (
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
            {TAB_LABELS[v]}
          </button>
        ))}
      </div>

      {subView === 'canvas' ? (
        <div className="flex-1 overflow-hidden">
          <RdfCanvas />
        </div>
      ) : subView === 'schema' ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <SchemaGraphView />
        </div>
      ) : (
        <OntologyTable />
      )}
    </div>
  )
}
