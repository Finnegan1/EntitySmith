import { createContext, useCallback, useContext, useState } from 'react'
import { toast } from 'sonner'
import type { DatasetFile } from '@/types'

interface DatasetContextValue {
  dataset: DatasetFile | null
  isDirty: boolean
  setDataset: (dataset: DatasetFile | null) => void
  updateCell: (rowIdx: number, col: string, val: unknown) => void
  addAttribute: (name: string, defaultVal: unknown) => void
  removeAttribute: (name: string) => void
  save: (filePath: string) => Promise<void>
}

export const DatasetContext = createContext<DatasetContextValue | null>(null)

export function useDatasetState(): DatasetContextValue {
  const [dataset, setDatasetRaw] = useState<DatasetFile | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  const setDataset = useCallback((d: DatasetFile | null) => {
    setDatasetRaw(d)
    setIsDirty(false)
  }, [])

  const updateCell = useCallback((rowIdx: number, col: string, val: unknown) => {
    setDatasetRaw((prev) => {
      if (!prev) return prev
      const newData = prev.data.map((entry, i) =>
        i === rowIdx ? { ...entry, [col]: val } : entry
      )
      return { ...prev, data: newData }
    })
    setIsDirty(true)
  }, [])

  const addAttribute = useCallback((name: string, defaultVal: unknown) => {
    setDatasetRaw((prev) => {
      if (!prev) return prev
      const newData = prev.data.map((entry) => ({ ...entry, [name]: defaultVal }))
      return { ...prev, data: newData }
    })
    setIsDirty(true)
  }, [])

  const removeAttribute = useCallback((name: string) => {
    setDatasetRaw((prev) => {
      if (!prev) return prev
      const newData = prev.data.map((entry) => {
        const copy = { ...entry }
        delete copy[name]
        return copy
      })
      return { ...prev, data: newData }
    })
    setIsDirty(true)
  }, [])

  const save = useCallback(async (filePath: string) => {
    if (!dataset) return
    try {
      await window.api.saveDataset({ filePath, dataset })
      setIsDirty(false)
      toast.success('Dataset saved.')
    } catch {
      toast.error('Failed to save dataset.')
    }
  }, [dataset])

  return { dataset, isDirty, setDataset, updateCell, addAttribute, removeAttribute, save }
}

export function useDataset(): DatasetContextValue {
  const ctx = useContext(DatasetContext)
  if (!ctx) throw new Error('useDataset must be used within DatasetProvider')
  return ctx
}
