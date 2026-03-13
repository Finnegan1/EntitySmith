import { ipcMain, dialog } from 'electron'
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { initWorkspaceStore, readWorkspaces, addWorkspace, removeWorkspace } from './workspace-store'

interface RawFileResult {
  name: string
  path: string
  content: string | null
  isMarkdown: boolean
}

interface SaveDatasetPayload {
  filePath: string
  dataset: unknown
}

export function registerIpcHandlers(userDataPath: string): void {
  initWorkspaceStore(userDataPath)

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('workspace:list', () => {
    return readWorkspaces()
  })

  ipcMain.handle('workspace:add', (_event, path: string) => {
    addWorkspace(path)
  })

  ipcMain.handle('workspace:remove', (_event, path: string) => {
    removeWorkspace(path)
  })

  ipcMain.handle('workspace:readFiles', (_event, workspacePath: string): RawFileResult[] => {
    try {
      const entries = readdirSync(workspacePath, { withFileTypes: true })
      return entries
        .filter((e) => e.isFile() && (e.name.endsWith('.json') || e.name.endsWith('.md')))
        .map((e) => {
          const filePath = join(workspacePath, e.name)
          const isMarkdown = e.name.endsWith('.md')
          try {
            const content = readFileSync(filePath, 'utf-8')
            return { name: e.name, path: filePath, content, isMarkdown }
          } catch {
            return { name: e.name, path: filePath, content: null, isMarkdown }
          }
        })
    } catch {
      return []
    }
  })

  ipcMain.handle('dataset:save', (_event, payload: SaveDatasetPayload) => {
    writeFileSync(payload.filePath, JSON.stringify(payload.dataset, null, 2), 'utf-8')
  })
}
