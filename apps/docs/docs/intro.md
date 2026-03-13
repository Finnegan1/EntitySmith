---
sidebar_position: 1
slug: /
---

# Introduction

**Knowledge Graph Creator** is a local-first desktop application for managing structured JSON datasets. It is built with Electron and designed for researchers, data engineers, and anyone who maintains collections of JSON files that share a consistent schema.

## What it does

1. Point the app at a **workspace** — any folder on your disk.
2. The app discovers every `.json` file in that folder, validates it, and lists it in a sidebar.
3. Select a file → its rows render as an **editable table**. Click any cell to edit it inline.
4. **Add or remove columns** across the entire dataset in one action.
5. Save back to disk with **Cmd/Ctrl+S** or the Save button.

No data leaves your machine. No backend. No network calls.

## What "valid" means

The app expects each JSON file to follow this shape:

```json
{
  "datasetName": "My Dataset",
  "description": "What this data is about",
  "source": "Where the data came from",
  "data": [
    { "col1": "value", "col2": 42 },
    { "col1": "other", "col2": 7 }
  ]
}
```

Files that don't match this schema are not rejected — they still appear in the sidebar with a red **Error** badge and a list of exactly what is wrong. See [Validation](./data-model/validation.md) for the full rules.

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 41 |
| Build tool | electron-vite 5 (wraps Vite 7) |
| UI framework | React 19 + TypeScript 5.9 |
| Styling | Tailwind CSS 4 |
| Component library | shadcn/ui |
| Monorepo | Turborepo 2 |
| Package manager | Bun |

## Where to go next

- **New to the project?** Start with [Installation](./getting-started/installation.md).
- **Want to understand the codebase?** Read [Architecture Overview](./architecture/overview.md).
- **Ready to build something?** Jump to [Adding a Feature](./contributing/adding-a-feature.md).
