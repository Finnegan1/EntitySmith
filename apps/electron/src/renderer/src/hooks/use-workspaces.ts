import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Workspace, WorkspaceFile } from '@/types'
import { validateDataset } from '@/lib/validate-dataset'

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
}

function buildWorkspaceFiles(
  rawFiles: { name: string; path: string; content: string | null; isMarkdown: boolean }[]
): WorkspaceFile[] {
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

interface WorkspaceContextValue {
  activeProject: Workspace | null
  recentPaths: string[]
  selectedFilePath: string | null
  openProject: (path: string) => Promise<void>
  openProjectDialog: () => Promise<void>
  selectFile: (path: string | null) => void
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useWorkspacesState(): WorkspaceContextValue {
  const [activeProject, setActiveProject] = useState<Workspace | null>(null)
  const [recentPaths, setRecentPaths] = useState<string[]>([])
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)

  // Load recent project paths on startup
  useEffect(() => {
    window.api.listWorkspaces().then(setRecentPaths)
  }, [])

  const openProject = useCallback(async (path: string) => {
    const rawFiles = await window.api.readWorkspaceFiles(path)
    const project: Workspace = {
      path,
      name: basename(path),
      files: buildWorkspaceFiles(rawFiles),
    }
    await window.api.addWorkspace(path)
    setRecentPaths((prev) =>
      prev.includes(path) ? [path, ...prev.filter((p) => p !== path)] : [path, ...prev]
    )
    setActiveProject(project)
    setSelectedFilePath(null)
  }, [])

  const openProjectDialog = useCallback(async () => {
    const path = await window.api.openFolderDialog()
    if (!path) return
    await openProject(path)
  }, [openProject])

  const selectFile = useCallback((path: string | null) => {
    setSelectedFilePath(path)
  }, [])

  // Listen for native File > Open Folder… menu action
  useEffect(() => {
    return window.api.onMenuOpenProject((path) => {
      openProject(path)
    })
  }, [openProject])

  return { activeProject, recentPaths, selectedFilePath, openProject, openProjectDialog, selectFile }
}

export function useWorkspaces(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspaces must be used within WorkspaceProvider')
  return ctx
}
