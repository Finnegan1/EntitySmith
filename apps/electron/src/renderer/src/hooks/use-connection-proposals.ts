import { createContext, useCallback, useContext, useState } from 'react'
import type { ConnectionProposal } from '@/types'

interface ConnectionProposalsContextValue {
  proposals: ConnectionProposal[]
  addProposals: (newProposals: ConnectionProposal[]) => void
  dismissProposal: (id: string) => void
  restoreProposal: (id: string) => void
  clearProposalsForNode: (nodeId: string) => void
}

export const ConnectionProposalsContext = createContext<ConnectionProposalsContextValue | null>(null)

export function useConnectionProposalsState(): ConnectionProposalsContextValue {
  const [proposals, setProposals] = useState<ConnectionProposal[]>([])

  const addProposals = useCallback((newProposals: ConnectionProposal[]) => {
    setProposals((prev) => {
      const existingIds = new Set(prev.map((p) => p.id))
      const toAdd = newProposals.filter((p) => !existingIds.has(p.id))
      return [...prev, ...toAdd]
    })
  }, [])

  const dismissProposal = useCallback((id: string) => {
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, dismissed: true } : p)))
  }, [])

  const restoreProposal = useCallback((id: string) => {
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, dismissed: false } : p)))
  }, [])

  const clearProposalsForNode = useCallback((nodeId: string) => {
    setProposals((prev) => prev.filter((p) => p.sourceNodeId !== nodeId && p.targetNodeId !== nodeId))
  }, [])

  return { proposals, addProposals, dismissProposal, restoreProposal, clearProposalsForNode }
}

export function useConnectionProposals(): ConnectionProposalsContextValue {
  const ctx = useContext(ConnectionProposalsContext)
  if (!ctx) throw new Error('useConnectionProposals must be used within ConnectionProposalsContext.Provider')
  return ctx
}
