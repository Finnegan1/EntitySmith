import { createContext, useCallback, useContext, useState } from 'react'
import type { Prefix } from '@/types'

export const DEFAULT_PREFIXES: Prefix[] = [
  { prefix: 'rdf',    iri: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' },
  { prefix: 'rdfs',   iri: 'http://www.w3.org/2000/01/rdf-schema#' },
  { prefix: 'owl',    iri: 'http://www.w3.org/2002/07/owl#' },
  { prefix: 'xsd',    iri: 'http://www.w3.org/2001/XMLSchema#' },
  { prefix: 'ex',     iri: 'http://example.org/' },
  { prefix: 'schema', iri: 'https://schema.org/' },
]

export interface PrefixState {
  prefixes: Prefix[]
  addPrefix: (p: Prefix) => void
  updatePrefix: (index: number, p: Prefix) => void
  removePrefix: (index: number) => void
  resolvePrefix: (curie: string) => string
}

export const PrefixContext = createContext<PrefixState | null>(null)

export function usePrefixesState(): PrefixState {
  const [prefixes, setPrefixes] = useState<Prefix[]>(DEFAULT_PREFIXES)

  const addPrefix = useCallback((p: Prefix) => {
    setPrefixes((prev) => [...prev, p])
  }, [])

  const updatePrefix = useCallback((index: number, p: Prefix) => {
    setPrefixes((prev) => prev.map((x, i) => (i === index ? p : x)))
  }, [])

  const removePrefix = useCallback((index: number) => {
    setPrefixes((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const resolvePrefix = useCallback(
    (curie: string) => {
      const colonIdx = curie.indexOf(':')
      if (colonIdx === -1) return curie
      const pfx = curie.slice(0, colonIdx)
      const local = curie.slice(colonIdx + 1)
      const found = prefixes.find((p) => p.prefix === pfx)
      return found ? `${found.iri}${local}` : curie
    },
    [prefixes]
  )

  return { prefixes, addPrefix, updatePrefix, removePrefix, resolvePrefix }
}

export function usePrefixes(): PrefixState {
  const ctx = useContext(PrefixContext)
  if (!ctx) throw new Error('usePrefixes must be used within PrefixContext.Provider')
  return ctx
}
