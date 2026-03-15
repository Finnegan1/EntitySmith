import { ipcMain, dialog } from 'electron'
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import Database from 'better-sqlite3'
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

export function registerIpcHandlers(userDataPath: string, appPath: string): void {
  initWorkspaceStore(userDataPath)

  // In development, pre-seed the test workspace so it appears in the list on first launch
  if (is.dev) {
    addWorkspace(join(appPath, 'test_workspace'))
  }

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

  // ── SQLite / Database handlers ───────────────────────────────────────────────

  ipcMain.handle('db:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3', 's3db', 'sl3'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('db:getSchema', (_event, filePath: string) => {
    const db = new Database(filePath, { readonly: true })
    try {
      const tableRows = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all() as { name: string }[]

      return tableRows.map(({ name: tableName }) => {
        const safe = tableName.replace(/"/g, '""')
        const columns = db.prepare(`PRAGMA table_info("${safe}")`).all() as Array<{
          cid: number; name: string; type: string; notnull: number; pk: number
        }>
        const fks = db.prepare(`PRAGMA foreign_key_list("${safe}")`).all() as Array<{
          table: string; from: string; to: string
        }>
        return {
          tableName,
          columns: columns.map((c) => ({
            name: c.name,
            type: c.type || 'TEXT',
            notNull: c.notnull === 1,
            primaryKey: c.pk > 0,
          })),
          foreignKeys: fks.map((fk) => ({
            fromColumn: fk.from,
            toTable: fk.table,
            toColumn: fk.to,
          })),
        }
      })
    } finally {
      db.close()
    }
  })

  ipcMain.handle('db:queryTable', (_event, filePath: string, tableName: string) => {
    const db = new Database(filePath, { readonly: true })
    try {
      const safe = tableName.replace(/"/g, '""')
      return db.prepare(`SELECT * FROM "${safe}" LIMIT 1000`).all()
    } finally {
      db.close()
    }
  })
}
