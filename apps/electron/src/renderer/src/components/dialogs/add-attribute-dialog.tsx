import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useDataset } from '@/hooks/use-dataset'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddAttributeDialog({ open, onOpenChange }: Props) {
  const { dataset, addAttribute } = useDataset()
  const [name, setName] = useState('')
  const [defaultVal, setDefaultVal] = useState('')
  const [error, setError] = useState<string | null>(null)

  const existingKeys = dataset?.data[0] ? Object.keys(dataset.data[0]) : []

  function handleSubmit() {
    if (!name.trim()) {
      setError('Attribute name cannot be empty.')
      return
    }
    if (existingKeys.includes(name.trim())) {
      setError('An attribute with this name already exists.')
      return
    }
    addAttribute(name.trim(), defaultVal)
    setName('')
    setDefaultVal('')
    setError(null)
    onOpenChange(false)
  }

  function handleOpenChange(o: boolean) {
    if (!o) {
      setName('')
      setDefaultVal('')
      setError(null)
    }
    onOpenChange(o)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Attribute</DialogTitle>
          <DialogDescription>
            Add a new column to all {dataset?.data.length ?? 0} entries.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Attribute name</label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null) }}
              placeholder="e.g. category"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Default value</label>
            <Input
              value={defaultVal}
              onChange={(e) => setDefaultVal(e.target.value)}
              placeholder="e.g. unknown"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>Add Attribute</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
