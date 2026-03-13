import type { SaveDatasetPayload, RawFileResult } from './types'

interface WindowApi {
  openFolderDialog: () => Promise<string | null>
  listWorkspaces: () => Promise<string[]>
  addWorkspace: (path: string) => Promise<void>
  removeWorkspace: (path: string) => Promise<void>
  readWorkspaceFiles: (workspacePath: string) => Promise<RawFileResult[]>
  saveDataset: (payload: SaveDatasetPayload) => Promise<void>
  onMenuOpenProject: (cb: (path: string) => void) => () => void
}

declare global {
  interface Window {
    api: WindowApi
  }
}
