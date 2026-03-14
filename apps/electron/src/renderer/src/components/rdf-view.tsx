import { useMemo, useState } from 'react'
import { useRdfGraph } from '@/hooks/use-rdf-graph'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RdfCanvas } from './rdf-view/rdf-canvas'

type RdfSubView = 'canvas' | 'table'

interface SchemaTriple {
  subject: string
  predicate: string
  object: string
}

function attrFromHandle(handle: string | null | undefined): string {
  if (!handle) return '?'
  return handle.replace(/-left$|-right$/, '')
}

function SchemaTable() {
  const { nodes, edges } = useRdfGraph()

  const triples = useMemo<SchemaTriple[]>(() => {
    const result: SchemaTriple[] = []

    for (const node of nodes) {
      result.push({
        subject: node.data.datasetName,
        predicate: 'rdf:type',
        object: 'Dataset'
      })
    }

    for (const edge of edges) {
      const sourceNode = nodes.find((n) => n.id === edge.source)
      const targetNode = nodes.find((n) => n.id === edge.target)
      const sourceDataset = sourceNode?.data.datasetName ?? edge.source
      const targetDataset = targetNode?.data.datasetName ?? edge.target
      const sourceAttr = attrFromHandle(edge.sourceHandle)
      const targetAttr = attrFromHandle(edge.targetHandle)
      result.push({
        subject: `${sourceDataset}.${sourceAttr}`,
        predicate: String(edge.label ?? edge.id),
        object: `${targetDataset}.${targetAttr}`
      })
    }

    return result
  }, [nodes, edges])

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm font-medium">No schema defined yet</p>
        <p className="text-xs">Add datasets to the canvas and connect them to build the schema.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
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
  )
}

export function RdfView() {
  const [subView, setSubView] = useState<RdfSubView>('canvas')

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-stretch border-b">
        {(['canvas', 'table'] as RdfSubView[]).map((v) => (
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
            {v === 'canvas' ? 'Canvas' : 'Schema'}
          </button>
        ))}
      </div>

      {subView === 'canvas' ? (
        <div className="flex-1 overflow-hidden">
          <RdfCanvas />
        </div>
      ) : (
        <SchemaTable />
      )}
    </div>
  )
}
