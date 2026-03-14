# Knowledge Graph Creator — Contributor Guide

## Goal

Help users build a valid, standards-compliant RDF knowledge graph from existing tabular datasets (JSON files) **with as few manual steps and as much clarity as possible.**

The app bridges the gap between relational/tabular data and the RDF data model. A user should be able to drop in their datasets, see a sensible RDF mapping auto-generated, tweak it visually, and export clean Turtle — without needing to understand RDF internals upfront.

---

## Mental Model

### The core mapping

Every dataset maps to a single RDF concept:

```
Dataset file  →  RDF Class          (e.g. users.json  →  ex:User)
Each row      →  RDF Instance       (e.g. row {id:1}  →  ex:User_1)
Each column   →  RDF Data Property  (e.g. "name"      →  ex:name "Alice"^^xsd:string)
Edge on canvas →  RDF Object Property (e.g. users→orders  →  ex:hasOrder)
```

The primary key column of a dataset becomes the local part of the instance URI. A join between two datasets (edge on canvas) becomes an object property triple, resolved by matching column values.

### What a user does (happy path)

1. **Open a workspace** — a folder of `.json` dataset files
2. **Data tab** — inspect and edit individual datasets; fix validation errors
3. **RDF tab** — drag datasets onto the canvas; the tool auto-infers class names, predicate names, and XSD datatypes; draw edges between datasets to define object properties; optionally tweak class names, predicates, datatypes inline
4. **Preview tab** — inspect the generated triples (Table), see the schema graph (Schema Graph), or copy the Turtle output (Turtle)

### Key design principles

- **Smart defaults over manual config** — dropping a dataset produces a complete, working RDF mapping automatically. Users edit exceptions, not the rule.
- **Inline editing** — class names and predicates are edited directly on the canvas node, not in a separate dialog. No round-trips.
- **Dataset-centric** — the tool is built for knowledge graph creation *from data*, not abstract RDF authoring. Every node on the canvas corresponds to a real dataset file.
- **Clarity over completeness** — the schema graph shows the class-level view (always compact), not thousands of instance nodes.

---

## Architecture

### Monorepo layout

```
apps/
  electron/          — main Electron + React app
  docs/              — Docusaurus documentation site
```

### Electron app layers

```
src/
  main/              — Electron main process
    ipc/handlers.ts  — IPC: open folder dialog, read workspace files, save datasets
    ipc/workspace-store.ts — persists workspace paths to userDataPath
  preload/           — contextBridge API exposed to renderer
  renderer/src/      — React UI (Vite + Tailwind)
```

### Renderer: state architecture

Three React contexts, composed in `App.tsx`:

| Context | Hook | Responsibility |
|---|---|---|
| `WorkspaceContext` | `useWorkspaces` | Active workspace, file list, selected file |
| `DatasetContext` | `useDataset` | Currently viewed dataset, dirty state, save |
| `RdfGraphContext` | `useRdfGraph` | ReactFlow nodes/edges + all RDF mapping state |
| `PrefixContext` | `usePrefixes` | Namespace prefixes (rdf:, xsd:, ex:, …) |

### Renderer: key files

```
hooks/
  use-workspaces.ts     — workspace + file management
  use-dataset.ts        — single-dataset view/edit state
  use-rdf-graph.ts      — RDF canvas state (nodes, edges, mappings)
  use-prefixes.ts       — namespace prefix list

lib/
  rdf-inference.ts      — auto-inference: class names, datatypes, predicates
  validate-dataset.ts   — JSON dataset validation rules

components/
  dataset-view/         — Data tab: table editor for a single dataset
  dataset-table/        — Reusable table + toolbar
  rdf-view.tsx          — RDF tab shell (Canvas / Ontology sub-views)
  rdf-view/
    rdf-canvas.tsx      — ReactFlow canvas; handles drag-drop, context menus
    dataset-node.tsx    — The main canvas node: shows class, predicates, datatypes
    colored-edge.tsx    — Draggable curved edge with label
    edge-label-dialog.tsx — Dialog to name a new predicate when connecting nodes
    canvas-context-menu.tsx — Right-click menu (delete, rename)
    prefix-manager-panel.tsx — Floating namespace prefix editor on canvas
  preview-view.tsx      — Preview tab: Table / Schema Graph / Turtle sub-views
```

### Dataset node data model (`RdfNodeData`)

```typescript
interface RdfNodeData {
  datasetName: string                          // file name, e.g. "users.json"
  attributes: string[]                         // column names
  filePath: string                             // absolute path (also the node ID)
  idField: string                              // primary key column name
  rdfClass: string                             // CURIE, e.g. "ex:User"
  subjectColumn: string                        // column used for URI key
  columnMappings: Record<string, ColumnMapping> // per-column RDF settings
}

interface ColumnMapping {
  predicate: string    // CURIE, e.g. "ex:name"
  datatype: XsdDatatype // e.g. "xsd:string"
  omit: boolean        // if true, skip in triple output
}
```

### Auto-inference (`lib/rdf-inference.ts`)

Called once when a dataset is dropped onto the canvas:

- `inferRdfClass(datasetName)` — PascalCase + simple singularization (`users` → `ex:User`)
- `inferDatatype(values[])` — samples first 50 rows; detects boolean, integer, decimal, dateTime, date, anyURI, falls back to string
- `inferColumnMappings(attributes, data)` — combines the above per column, converts names to camelCase predicates

### Triple generation (`preview-view.tsx → useActualTriples`)

Produces `{ subject, predicate, object, isLiteral }` records in two passes:

1. **Data properties** — iterate every row of every dataset; generate `rdf:type` + one triple per non-omitted column
2. **Object properties** — for each canvas edge, inner-join source and target datasets on the handle columns; emit `subject predicate object` using each node's `subjectColumn` for URI construction

Subject URI format: `ex:{ClassName}_{sanitizedPrimaryKeyValue}`

### Dataset file format

Datasets are `.json` files in a workspace folder. Expected shape:

```json
{
  "datasetName": "users",
  "description": "Application users",
  "source": "...",
  "id": "user_id",
  "data": [
    { "user_id": 1, "name": "Alice", "email": "alice@example.com" }
  ]
}
```

Validation rules live in `lib/validate-dataset.ts`. Errors are shown in the Data tab and sidebar.

### UI stack

- **Electron 41** + **electron-vite**
- **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **shadcn/ui** components (Radix UI primitives)
- **ReactFlow (@xyflow/react)** — canvas, nodes, edges
- **Graphology + @react-sigma/core** — schema graph in Preview
- **CodeMirror (@uiw/react-codemirror)** — Turtle raw view

---

## Adding a new feature — checklist

- **New node-level setting**: add to `RdfNodeData` in `types/index.ts` → add update method in `use-rdf-graph.ts` → render/edit in `dataset-node.tsx`
- **New triple pattern**: extend `useActualTriples` in `preview-view.tsx`; update `triplesToTurtle` if serialization changes
- **New inferred property**: add to `inferColumnMappings` or `inferRdfClass` in `lib/rdf-inference.ts`
- **New prefix**: add to `DEFAULT_PREFIXES` in `hooks/use-prefixes.ts`
- **New dataset validation rule**: add to `lib/validate-dataset.ts`
- **New canvas interaction**: wire up in `rdf-canvas.tsx`; surface context menu actions in `canvas-context-menu.tsx`

---

## Known limitations / future work

- **No persistence of the RDF graph state** — nodes, edges, and mappings are in-memory only; closing the app loses the canvas. A save/load mechanism (JSON sidecar file per workspace) is the natural next step.
- **Object property direction** — the edge always goes source → target; reverse direction requires drawing a separate edge.
- **Blank nodes** — not yet supported as first-class canvas nodes.
- **Import RDF** — no way to load existing Turtle/JSON-LD to populate the canvas.
- **Large datasets** — the triple table in Preview can become very long; pagination or virtual scrolling would help.
- **Export** — Turtle is shown read-only in the UI; a "Copy" / "Save to file" button is missing.
