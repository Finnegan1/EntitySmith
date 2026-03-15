import { ipcRenderer } from 'electron'

export const api = {
  openFolderDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
  listWorkspaces: (): Promise<string[]> => ipcRenderer.invoke('workspace:list'),
  addWorkspace: (path: string): Promise<void> => ipcRenderer.invoke('workspace:add', path),
  removeWorkspace: (path: string): Promise<void> => ipcRenderer.invoke('workspace:remove', path),
  readWorkspaceFiles: (workspacePath: string): Promise<unknown[]> =>
    ipcRenderer.invoke('workspace:readFiles', workspacePath),
  saveDataset: (payload: unknown): Promise<void> =>
    ipcRenderer.invoke('dataset:save', payload),
  onMenuOpenProject: (cb: (path: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, path: string): void => cb(path)
    ipcRenderer.on('menu:openProject', handler)
    return () => ipcRenderer.off('menu:openProject', handler)
  },
  // ── SQLite / Database ──────────────────────────────────────────────────────
  openDbFileDialog: (): Promise<string | null> => ipcRenderer.invoke('db:openFile'),
  getDbSchema: (filePath: string): Promise<unknown[]> => ipcRenderer.invoke('db:getSchema', filePath),
  queryDbTable: (filePath: string, tableName: string): Promise<unknown[]> =>
    ipcRenderer.invoke('db:queryTable', filePath, tableName),
}
