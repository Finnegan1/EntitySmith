import type { SaveDatasetPayload, RawFileResult, DbTableSchema } from './types'

interface WindowApi {
  openFolderDialog: () => Promise<string | null>
  listWorkspaces: () => Promise<string[]>
  addWorkspace: (path: string) => Promise<void>
  removeWorkspace: (path: string) => Promise<void>
  readWorkspaceFiles: (workspacePath: string) => Promise<RawFileResult[]>
  saveDataset: (payload: SaveDatasetPayload) => Promise<void>
  onMenuOpenProject: (cb: (path: string) => void) => () => void
  // SQLite / Database
  openDbFileDialog: () => Promise<string | null>
  getDbSchema: (filePath: string) => Promise<DbTableSchema[]>
  queryDbTable: (filePath: string, tableName: string) => Promise<Record<string, unknown>[]>
}

declare global {
  interface Window {
    api: WindowApi
  }
}
