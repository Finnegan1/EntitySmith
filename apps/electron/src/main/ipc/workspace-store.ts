import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

let configPath: string

function getConfigPath(): string {
  return configPath
}

export function initWorkspaceStore(userDataPath: string): void {
  configPath = join(userDataPath, 'workspaces.json')
}

export function readWorkspaces(): string[] {
  try {
    if (!existsSync(getConfigPath())) return []
    const raw = readFileSync(getConfigPath(), 'utf-8')
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

function writeWorkspaces(paths: string[]): void {
  writeFileSync(getConfigPath(), JSON.stringify(paths, null, 2), 'utf-8')
}

export function addWorkspace(p: string): void {
  const workspaces = readWorkspaces()
  if (!workspaces.includes(p)) {
    workspaces.push(p)
    writeWorkspaces(workspaces)
  }
}

export function removeWorkspace(p: string): void {
  const workspaces = readWorkspaces().filter((w) => w !== p)
  writeWorkspaces(workspaces)
}
