---
sidebar_position: 2
---

# Known Gotchas

Things that are not obvious from reading the code and have burned contributors before.

---

## Package name must not be "electron"

The workspace package in `apps/electron/package.json` is named `"knowledge-graph-creator"`. **Do not rename it back to `"electron"`.**

When Bun sees a workspace package named `"electron"`, it creates a `node_modules/electron` symlink pointing at that workspace. electron-vite uses `createRequire(import.meta.url).resolve('electron')` to locate the Electron binary — and with that symlink in place it resolves to `apps/electron/out/main/index.js` instead of the actual binary, throwing:

```
Error: Electron uninstall
```

The root `package.json` must also **not** list `"electron": "workspace:*"` as a dependency, for the same reason.

---

## shadcn installs to a literal "@/" directory

If you run `bunx shadcn add` and the `components.json` aliases use `@/` prefixes, shadcn will create a literal `@/components/ui/` directory at the project root instead of writing to `src/renderer/src/components/ui/`.

The `components.json` aliases are currently set to real relative paths:

```json
"aliases": {
  "ui": "src/renderer/src/components/ui",
  ...
}
```

Do not change these to `@/` aliases. If you ever need to re-initialise shadcn, make sure to restore the real paths afterward.

---

## The renderer cannot import Node built-ins

The renderer is a pure browser environment. Any `import ... from 'fs'`, `'path'`, `'os'`, or any other Node built-in will cause a Vite build error:

```
Module "path" has been externalized for browser compatibility
```

If you need a utility like `basename`, implement it inline:

```ts
function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
}
```

If you need real file system access, use an IPC call instead.

---

## Cross-tsconfig imports are forbidden

`src/main/` and `src/preload/` are compiled by `tsconfig.node.json`. `src/renderer/` is compiled by `tsconfig.web.json`. TypeScript's composite project mode does not allow one project to import source files from the other.

If you need a type in both contexts, either:

- Define it inline in both places (fine for small types), or
- Create a `src/shared/` directory, add `"src/shared/**/*"` to both `include` arrays, and put the shared type there.

---

## electron-vite requires explicit build targets

`electron.vite.config.ts` sets `build.target` for all three configs:

```ts
main:     { build: { target: 'node22' } }
preload:  { build: { target: 'node22' } }
renderer: { build: { target: 'chrome130' } }
```

electron-vite v5 throws `build.target option is required` if any of these are missing. Do not remove them.

---

## Validation only runs at load time

`validateDataset()` is called once when a workspace is added or loaded. The `dataset` in `DatasetContext` is then a mutable in-memory copy that is never re-validated.

This means:
- Editing a cell to an "invalid" value (wrong type, mismatched key) does not produce an error in the UI.
- The app trusts its own edits and will save whatever state the context holds.

If you want to add live validation (e.g. type-check cell values), you would need to call `validateDataset` after each `updateCell` and surface the result — that is currently out of scope.

---

## Workspace state is not reactive to disk changes

Adding a workspace reads the folder once. If you add, rename, or delete a `.json` file externally while the app is running, the sidebar will not update. Remove and re-add the workspace to refresh it.
