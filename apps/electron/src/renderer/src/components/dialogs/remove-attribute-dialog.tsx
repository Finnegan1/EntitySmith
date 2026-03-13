import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDataset } from '@/hooks/use-dataset'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  attributeName: string | null
}

export function RemoveAttributeDialog({ open, onOpenChange, attributeName }: Props) {
  const { dataset, removeAttribute } = useDataset()

  function handleConfirm() {
    if (!attributeName) return
    removeAttribute(attributeName)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Attribute</DialogTitle>
          <DialogDescription>
            Remove attribute <strong>&quot;{attributeName}&quot;</strong> from all{' '}
            {dataset?.data.length ?? 0} entries? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm}>Remove</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
