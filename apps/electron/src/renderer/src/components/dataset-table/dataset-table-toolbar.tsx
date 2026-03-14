import { useState } from 'react'
import { Plus, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDataset } from '@/hooks/use-dataset'
import { AddAttributeDialog } from '@/components/dialogs/add-attribute-dialog'
import { RemoveAttributeDialog } from '@/components/dialogs/remove-attribute-dialog'

export function DatasetTableToolbar() {
  const { dataset } = useDataset()
  const [addOpen, setAddOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)

  const columns = dataset?.data[0] ? Object.keys(dataset.data[0]) : []

  function handleRemoveAttribute(col: string) {
    setRemoveTarget(col)
    setRemoveOpen(true)
  }

  return (
    <>
      <div className="flex items-center gap-1.5 border-b bg-muted/10 px-3 py-1.5">
        <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)} className="h-7 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Add Attribute
        </Button>
        {columns.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs">Remove Attribute</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {columns.map((col) => (
                <DropdownMenuItem
                  key={col}
                  onClick={() => handleRemoveAttribute(col)}
                  className="text-xs text-destructive focus:text-destructive"
                >
                  {col === dataset?.id && (
                    <KeyRound className="mr-1.5 h-3 w-3 shrink-0 opacity-60" />
                  )}
                  {col}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <AddAttributeDialog open={addOpen} onOpenChange={setAddOpen} />
      <RemoveAttributeDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        attributeName={removeTarget}
      />
    </>
  )
}
