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
}
