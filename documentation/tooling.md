# Tooling

## shadcn/ui + Tailwind CSS 4

### How shadcn is set up

shadcn was initialised with a custom preset (`ac2GWv`) targeting the Vite template:

```sh
bunx --bun shadcn@latest init --preset ac2GWv --template vite
```

This produced:
- `components.json` — shadcn config, style `radix-nova`, Tailwind v4, `@/` aliases
- `src/components/ui/button.tsx` — first component
- `src/lib/utils.ts` — `cn()` utility (clsx + tailwind-merge)
- Updated `src/index.css` with the full design-token theme

### Tailwind v4 has no `tailwind.config.js`

Tailwind CSS 4 uses a Vite plugin instead of a config file. The plugin is registered in `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";

plugins: [react(), tailwindcss()],
```

The entry-point CSS (`src/index.css`) starts with:

```css
@import "tailwindcss";
```

**There is no `tailwind.config.js`.** This is correct and intentional for v4. shadcn's `components.json` reflects this with `"config": ""`.

Design tokens (colors, radius, sidebar vars) are defined as CSS custom properties in `src/index.css` under `:root` and `.dark`. They are exposed to Tailwind via `@theme inline { ... }`.

### Why `@tailwindcss/vite` is in `dependencies`, not `devDependencies`

Tauri builds the frontend as part of `tauri build`, which runs Vite. The `@tailwindcss/vite` plugin must be present at build time in the Tauri build environment, which reads `dependencies` in some configurations. Keeping it in `dependencies` avoids subtle missing-module errors in CI or fresh checkouts.

---

## Path alias (`@/`)

The `@/` alias maps to `src/`. It is configured in two places:

**`tsconfig.json`** — for TypeScript's type checker:
```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

**`vite.config.ts`** — for Vite's bundler at runtime:
```ts
import path from "path";

resolve: {
  alias: { "@": path.resolve(__dirname, "./src") },
},
```

Both are required. TypeScript uses `tsconfig.json` to resolve imports during `tsc` type-checking. Vite uses `vite.config.ts` at bundle time. If either is missing, one of the two will fail — the other succeeds, which makes the bug confusing to diagnose.

`@types/node` is a dev dependency because `path.resolve` and `__dirname` are Node.js globals; TypeScript needs their type definitions to check `vite.config.ts`.

---

## Tauri + Vite integration

Key settings in `vite.config.ts` that must not be removed:

```ts
clearScreen: false,          // Rust errors from `cargo` are visible in the same terminal
server: {
  port: 1420,                // Tauri's tauri.conf.json expects exactly this port
  strictPort: true,          // Fail immediately if port is taken; don't silently pick another
  host: host || false,       // Bind to TAURI_DEV_HOST for remote/mobile dev
  hmr: host ? { ... } : undefined,
  watch: {
    ignored: ["**/src-tauri/**"],  // Don't trigger HMR for Rust changes
  },
},
```

`TAURI_DEV_HOST` is set by `tauri dev` when targeting a remote device (e.g. iOS/Android). In normal desktop dev it is undefined, so `host: false` keeps the server local.

---

## Tauri MCP bridge

`tauri-plugin-mcp-bridge` is initialised **only in debug builds**:

```rust
#[cfg(debug_assertions)]
{
    builder = builder.plugin(tauri_plugin_mcp_bridge::init());
}
```

This exposes the Tauri IPC surface to the MCP dev tooling (Claude Code's `hypothesi-tauri-mcp-server`) during development. It is compiled out of release builds entirely — it is never shipped to end users.

---

## Package manager

Bun 1.3.5. Use `bun` instead of `npm`/`yarn` for all JS operations. Use `bunx` to run binaries (e.g. `bunx tauri dev`).
