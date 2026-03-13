import { app, BrowserWindow, shell, Menu, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc/handlers'

let mainWindow: BrowserWindow | null = null

function buildMenu(): void {
  const fileSubmenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Open Folder…',
      accelerator: 'CmdOrCtrl+O',
      async click() {
        if (!mainWindow) return
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ['openDirectory'],
        })
        if (!result.canceled && result.filePaths.length > 0) {
          mainWindow.webContents.send('menu:openProject', result.filePaths[0])
        }
      },
    },
    { type: 'separator' },
    { role: 'quit' },
  ]

  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { label: 'File', submenu: fileSubmenu },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  buildMenu()

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers(app.getPath('userData'))
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
