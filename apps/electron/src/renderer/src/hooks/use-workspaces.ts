import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Workspace, WorkspaceFile } from '@/types'

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
}
import { validateDataset } from '@/lib/validate-dataset'

interface WorkspaceContextValue {
  workspaces: Workspace[]
  selectedFilePath: string | null
  loadWorkspaces: () => Promise<void>
  addWorkspace: () => Promise<void>
  removeWorkspace: (path: string) => Promise<void>
  selectFile: (path: string | null) => void
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

function buildWorkspaceFiles(rawFiles: { name: string; path: string; content: string | null; isMarkdown: boolean }[]): WorkspaceFile[] {
  return rawFiles.map((raw) => {
    if (raw.isMarkdown) {
      return { name: raw.name, path: raw.path, status: 'markdown', validationErrors: [], dataset: null }
    }
    if (raw.content === null) {
      return {
        name: raw.name,
        path: raw.path,
        status: 'invalid',
        validationErrors: [{ kind: 'MALFORMED_JSON', message: 'Could not read file.' }],
        dataset: null,
      }
    }
    const { dataset, errors } = validateDataset(raw.content)
    return {
      name: raw.name,
      path: raw.path,
      status: errors.length > 0 ? 'invalid' : 'valid',
      validationErrors: errors,
      dataset,
    }
  })
}

export function useWorkspacesState(): WorkspaceContextValue {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)

  const loadWorkspaces = useCallback(async () => {
    const paths = await window.api.listWorkspaces()
    const loaded: Workspace[] = await Promise.all(
      paths.map(async (p) => {
        const rawFiles = await window.api.readWorkspaceFiles(p)
        return {
          path: p,
          name: basename(p),
          files: buildWorkspaceFiles(rawFiles),
        }
      })
    )
    setWorkspaces(loaded)
  }, [])

  const addWorkspace = useCallback(async () => {
    const path = await window.api.openFolderDialog()
    if (!path) return
    await window.api.addWorkspace(path)
    const rawFiles = await window.api.readWorkspaceFiles(path)
    const workspace: Workspace = {
      path,
      name: basename(path),
      files: buildWorkspaceFiles(rawFiles),
    }
    setWorkspaces((prev) => {
      if (prev.some((w) => w.path === path)) return prev
      return [...prev, workspace]
    })
  }, [])

  const removeWorkspace = useCallback(async (path: string) => {
    await window.api.removeWorkspace(path)
    setWorkspaces((prev) => prev.filter((w) => w.path !== path))
    setSelectedFilePath((prev) => {
      if (prev?.startsWith(path)) return null
      return prev
    })
  }, [])

  const selectFile = useCallback((path: string | null) => {
    setSelectedFilePath(path)
  }, [])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  return { workspaces, selectedFilePath, loadWorkspaces, addWorkspace, removeWorkspace, selectFile }
}

export function useWorkspaces(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspaces must be used within WorkspaceProvider')
  return ctx
}
