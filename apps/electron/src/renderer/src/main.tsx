import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"

// In a regular browser (not Electron) window.api doesn't exist.
// Stub it out so the UI can render for development/preview purposes.
if (typeof window.api === 'undefined') {
  (window as unknown as Record<string, unknown>).api = {
    listWorkspaces: () => Promise.resolve([]),
    addWorkspace: () => Promise.resolve(),
    removeWorkspace: () => Promise.resolve(),
    openFolderDialog: () => Promise.resolve(null),
    readWorkspaceFiles: () => Promise.resolve([]),
    saveDataset: () => Promise.resolve(),
    onMenuOpenProject: () => () => {},
    openDbFileDialog: () => Promise.resolve(null),
    getDbSchema: () => Promise.resolve([]),
    queryDbTable: () => Promise.resolve([]),
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)
