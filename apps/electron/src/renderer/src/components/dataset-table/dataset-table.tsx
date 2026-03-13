import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDataset } from '@/hooks/use-dataset'
import { DatasetTableCell } from './dataset-table-cell'

export function DatasetTable() {
  const { dataset } = useDataset()

  if (!dataset || dataset.data.length === 0) return null

  const columns = Object.keys(dataset.data[0])

  return (
    <ScrollArea className="flex-1">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-center font-mono text-[11px] text-muted-foreground">#</TableHead>
            {columns.map((col) => (
              <TableHead key={col} className="font-mono text-[11px]">{col}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {dataset.data.map((row, rowIdx) => (
            <TableRow key={rowIdx}>
              <TableCell className="text-center font-mono text-[11px] text-muted-foreground">{rowIdx + 1}</TableCell>
              {columns.map((col) => (
                <TableCell key={col} className="p-1">
                  <DatasetTableCell rowIdx={rowIdx} col={col} value={row[col]} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}
