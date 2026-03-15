# EntitySmith — Architecture Brainstorm & Design Document

> Status: Raw brainstorm. Not a spec. Meant to think out loud, challenge assumptions, and find the best path forward for the Tauri rewrite.

---

## 1. What the prototype taught us

The Electron prototype (apps/electron) already crystallized several good ideas:

- **Schema-level canvas, not instance-level.** You show *entity types* (User, Order, Product) as nodes and *relationship types* (works_for, contains) as edges — not the actual 50,000 user rows. This is the right mental model and it scales infinitely on the visual layer.
- **FK-based proposals work.** Automatically detecting foreign keys and proposing connections is genuinely useful. This should be the starting point for the full pipeline.
- **RDF/Turtle as the output target.** RDF is a good output format. It is a graph standard with excellent tooling. Stick with it, but also consider JSON-LD for web-friendliness.
- **Drag-and-drop onto canvas feels natural.** Keep this UX.
- **Everything in React state = won't scale.** Right now, datasets are fully loaded into JavaScript memory. For a 500MB CSV or a 10-table PostgreSQL database with millions of rows, this breaks.

The Tauri rewrite (EntitySmith) is the chance to fix the scalability problem properly.

---

## 2. The core insight: separate the schema graph from instance data

This is the most important architectural decision.

```
┌──────────────────────────────────────────────────┐
│  SCHEMA GRAPH (what the user edits)              │
│  ─ Entity types: User, Product, Order            │
│  ─ Relationships: User → buys → Product          │
│  ─ Attribute mappings, RDF classes, predicates   │
│  ─ Source references (which file/table this is)  │
│  Size: tiny. Always fits in memory.              │
└──────────────────────────────────────────────────┘
              ↕  references
┌──────────────────────────────────────────────────┐
│  INSTANCE DATA (stays in source, never fully     │
│  loaded into the app)                            │
│  ─ The actual CSV rows, DB rows, JSON entries    │
│  ─ Accessed lazily for preview / sampling        │
│  ─ Streamed for export                           │
│  Size: can be gigabytes.                         │
└──────────────────────────────────────────────────┘
```

The canvas, the ReactFlow graph, the user interaction — all of this operates ONLY on the schema graph. Instance data is accessed in two situations only:
1. **Sampling** — to show the user a preview (first N rows)
2. **Exporting** — to generate the final RDF triples or JSON-LD output

This means the app never has a scalability problem in the UI layer. The Rust backend handles heavy lifting.

---

## 3. User Flow & Pipeline

### The eight stages

```
  1. Source          2. Profiling &     3. Candidate       4. Semantic
     Registration       Normalization      Graph               Consolidation
  ───────────────    ───────────────    ───────────────    ───────────────
  Add sources        Auto-runs on       FK + soft FK       Merge / link /
  (structured +      ingestion.         detection.         subtype decisions.
  unstructured)      Type inference,    Heuristic +        Attribute mapping
                     PK/FK detection,   embedding +        + virtual columns
                     value profiles,    LLM proposals.     (DuckDB SQL).
                     source             User reviews.      Ontology alignment
                     fingerprints.                         (schema.org etc).

  5. Identity        6. Unstructured    7. Validation &    8. Export
     Resolution         Enrichment         Release Gate
  ───────────────    ───────────────    ───────────────    ───────────────
  URI minting        Per-document       Blocking errors    RDF/Turtle,
  strategy.          ontology           only. Alignment    JSON-LD,
  Record linkage.    extraction →       catch-up for       GraphML,
  Conflict policy.   merge →            Stage 6 types.     Mermaid.
  New types from     reconcile.         Graph is final     Schema-only or
  Stage 6 loop       NEW TYPES →        when no pending    + all instances.
  back here.         Stage 4.           loop-backs +
                     Instances →        Stage 7 passes.
                     Stage 5.
                     NEW EDGES →
                     staged queue.
                                        ◀ Live RDF preview panel: Stage 4 onwards
```

All stages are non-destructive. Source data is never modified. Every decision (merge, link, accept, reject, conflict resolution) is stored in the project SQLite with full provenance. Stages can be revisited — going back from Stage 4 to Stage 3 and re-running is normal.

**Terminology used consistently throughout this document:**
- **Connection proposal** — a proposed *relationship edge* between two entity types (produced in Stage 3)
- **Consolidation proposal** — a proposed *merge / link / subtype* decision between two entity types (produced in Stage 4)

These are distinct operations with distinct UI surfaces. "Cross-source matching" in Stage 3 produces connection proposals (edges). Similarity scoring in Stage 4 produces consolidation proposals (type decisions). Never conflate them.

---

### Provenance as a first-class concern across all stages

Every artifact produced during the pipeline — proposals, merge decisions, inferred edges, enrichment results, conflict resolutions — carries a provenance record from the moment it is created. This is not just an export concern.

```rust
struct ProvenanceRecord {
    source: ProvenanceSource,  // Fk, SoftFk, Heuristic, Embedding, Llm, Manual, Unstructured
    method: String,            // e.g. "column name similarity (jaro-winkler 0.94)"
    confidence: f32,           // 0.0 – 1.0
    evidence: Vec<Evidence>,   // quoted text, column samples, SQL snippets
    created_at: DateTime,
}
```

This makes every "why did the app suggest this?" question answerable in the UI, every decision auditable, and every undo operation precise.

---

### Stage 1 — Source Registration

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STAGE 1: Source Registration                                           │
│                                                                         │
│  User adds sources. Profiling runs automatically in the background      │
│  (Stage 2) as each source is registered.                                │
│                                                                         │
│  Structured:                                                            │
│    ─ SQLite files, PostgreSQL, MySQL                                    │
│    ─ CSV files, JSON files (custom format)                              │
│                                                                         │
│  Unstructured (registered here, processed in Stage 6):                 │
│    ─ Markdown files / folders                                           │
│    ─ PDF files                                                          │
│    ─ Web URLs                                                           │
│                                                                         │
│  Result: source list saved to project file                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Stage 2 — Profiling & Normalization

Runs automatically as a background job when sources are registered. The user doesn't initiate it — they see a progress indicator and then results. No decisions are required here; it is purely analytical.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STAGE 2: Profiling & Normalization (automatic, background)             │
│                                                                         │
│  Per structured source:                                                 │
│    ─ Column type inference (DuckDB DESCRIBE / SUMMARIZE)                │
│    ─ PK detection (declared + heuristic: unique + not-null int/uuid)    │
│    ─ Declared FK detection (PRAGMA / information_schema)                │
│    ─ Soft FK detection: value subset analysis across column pairs       │
│    ─ Per-column profile: null%, unique count, top values, min/max       │
│    ─ Source fingerprint: hash(schema + row count) for cache invalidation│
│                                                                         │
│  Results stored in project SQLite. Surfaced in the source browser as   │
│  a "Data Profile" view per entity type.                                 │
│                                                                         │
│  Result: Source Catalog — all entity types with full attribute          │
│  profiles, inferred PKs, and FK candidates. Foundation for Stage 3.    │
└─────────────────────────────────────────────────────────────────────────┘
```

The profile view (Glide Data Grid) shows per-attribute stats. High null rates, suspicious value distributions, or missing PKs surface here before they cause problems in graph building.

---

### Stage 3 — Candidate Graph Generation

Generates all connection proposals from the Source Catalog. The user reviews and accepts/rejects them. This is purely about *relationships between entity types* — not yet about which entity types are the same concept.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STAGE 3: Candidate Graph Generation                                    │
│                                                                         │
│  3a. Intra-source connections                                           │
│       ─ Declared FKs → high-confidence proposals (auto-accepted opt.)  │
│       ─ Soft FKs (value subset) → medium-confidence proposals           │
│                                                                         │
│  3b. Cross-source connections                                           │
│       ─ Column name similarity (strsim: Jaro-Winkler, Levenshtein)     │
│       ─ Sample value overlap (DuckDB cross-source JOIN count)           │
│       ─ Embedding similarity (fastembed-rs or OpenRouter)               │
│       ─ LLM reasoning for ambiguous cases (OpenRouter)                  │
│       Each proposal carries full provenance: method, confidence,        │
│       evidence (column samples, overlap count, LLM reasoning text)      │
│                                                                         │
│  3c. User reviews proposals (Proposals Panel)                           │
│       ─ Sorted by confidence                                            │
│       ─ Filterable by origin (FK / soft FK / heuristic / LLM)          │
│       ─ Accept / modify predicate name + cardinality / reject           │
│       ─ Each decision stored with provenance                            │
│                                                                         │
│  Result: a set of accepted relationships. Not yet a final graph —       │
│  entity type consolidation happens in Stage 4.                          │
│                                                                         │
│  Stage 3 → Stage 4 handoff rule:                                        │
│  After Stage 4 merge/subtype decisions, all accepted Stage 3 edges are  │
│  automatically remapped to canonical entity type names. If "users" was  │
│  merged into "User", every edge with "users" as an endpoint is updated  │
│  to "User". Edges whose both endpoints changed are flagged for          │
│  revalidation in Stage 4 (shown as "affected edges" needing review).    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Stage 4 — Semantic Consolidation

This is where the user decides what each entity type *is* in the final graph. Three distinct outcomes for consolidation proposals, plus attribute mapping with virtual column support and inline ontology alignment.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STAGE 4: Semantic Consolidation                                        │
│                                                                         │
│  4a. Consolidation decisions (Entity Catalog → comparison panel)        │
│                                                                         │
│  MERGE    ─ Same concept, same population. Internal consolidation:      │
│             the two source-local candidates collapse into one canonical  │
│             entity type with multiple source bindings. Only the         │
│             canonical type appears in the exported ontology — no        │
│             owl:equivalentClass, no trace of the source-local names.    │
│             e.g. app.sqlite/users + crm.sqlite/customers → ex:User      │
│                                                                         │
│  LINK     ─ Related but distinct. Keep separate, add a relationship.   │
│             e.g. users (app) → corresponds_to → customers (crm)        │
│                                                                         │
│  SUBTYPE  ─ One is more specific than the other.                        │
│             RDF: rdfs:subClassOf                                         │
│             e.g. PremiumUser is a subclass of User                      │
│                                                                         │
│  KEEP SEPARATE ─ Not the same concept. Dismiss the suggestion.          │
│                                                                         │
│  4b. Attribute mapping with virtual columns                             │
│       For each entity type, map raw source columns to RDF predicates.  │
│       Each mapping can source from:                                     │
│         ─ A raw column:  name → ex:name                                 │
│         ─ A DuckDB SQL expression (virtual column):                     │
│             CONCAT(first_name, ' ', last_name) → foaf:name             │
│             STRPTIME(weird_date, '%d-%b-%y')::DATE → ex:createdAt      │
│             UPPER(country_code) → ex:country                           │
│       Virtual columns are evaluated at export time as part of the       │
│       streaming query. Source data is never modified.                   │
│       Live RDF preview panel (see below) updates as mappings change.   │
│                                                                         │
│  4c. Ontology alignment suggestions (inline, during consolidation)      │
│       ─ When an entity type is confirmed, LLM suggests a schema.org    │
│         or Dublin Core mapping based on name + attributes               │
│         e.g. "Map User to schema:Person? Attributes match well."       │
│       ─ Accepting a mapping pre-fills RDF class name + attribute        │
│         predicates (schema:name, schema:email, dc:created, etc.)       │
│       ─ User can accept, modify, or skip per suggestion                 │
│       ─ Catch-up pass in Stage 7 covers entity types added in Stage 6  │
│                                                                         │
│  Result: confirmed schema graph with canonical types, attribute         │
│  mappings (including virtual columns), and ontology alignments          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Stage 5 — Identity Resolution & Conflict Policy

Distinct from schema consolidation. Stage 4 decided what entity *types* exist. Stage 5 decides which *rows* across sources refer to the same real-world entity, how contradictory values are handled, and — critically — what the final URI for each entity looks like.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STAGE 5: Identity Resolution & Conflict Policy                         │
│                                                                         │
│  5a. Within-source row deduplication                                    │
│       (Stage 1 can shortcut here for obviously dirty sources)           │
│       ─ Find duplicate rows within a single source                      │
│       ─ Match rules: exact (email), fuzzy (name >90%), composite        │
│       ─ Strategies: fast (exact only) / balanced / thorough (all-pairs) │
│       ─ User reviews duplicate groups, picks action per group           │
│                                                                         │
│  5b. Cross-source record linkage (requires Stage 4 to be complete)     │
│       ─ For merged entity types with multiple source bindings:          │
│         which rows from source A = which rows from source B?            │
│       ─ Match key configured per entity type (usually email, or PK)    │
│       ─ Result: linked row pairs stored in project SQLite               │
│                                                                         │
│  5c. URI minting strategy (per entity type)                             │
│       When rows from multiple sources are linked, they must share one   │
│       stable URI. Four strategies:                                      │
│                                                                         │
│       PRIMARY SOURCE  — use the PK from one designated source           │
│                         e.g. always app.sqlite → ex:User_1             │
│                                                                         │
│       NATURAL KEY     — use a meaningful column that exists in all      │
│                         sources (e.g. email) → ex:User_alice_at_ex_com  │
│                                                                         │
│       DETERMINISTIC UUID — hash(match key) → stable UUID-based URI     │
│                         e.g. SHA256(email) → ex:User_7f3a...           │
│                         Best for linked data: stable, opaque, portable  │
│                                                                         │
│       BLANK NODE      — no URI (not recommended for linked data)        │
│                                                                         │
│       Default suggestion: deterministic UUID if a natural key exists,  │
│       otherwise primary source PK. User can override per entity type.  │
│                                                                         │
│  5d. Conflict policy                                                    │
│       ─ For linked rows where attribute values disagree:                │
│         show a Conflicts panel (distinct from duplicates)               │
│       ─ Per-attribute resolution: prefer source A / prefer B /          │
│         prefer non-null / prefer most recent / keep both (named graphs) │
│       ─ "Keep both" exports to RDF named graphs — source-tagged triples │
│                                                                         │
│  Result: dedup decisions + URI strategies + conflict policies stored    │
│  in project SQLite. Applied at export time. Source never modified.      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Stage 6 — Unstructured Enrichment

Takes the confirmed schema graph (Stage 4) as its anchor. Extracts knowledge from documents and reconciles it against the graph. Importantly, Stage 6 is **not a terminal stage** — new entity types it produces can loop back to Stage 4 for consolidation, and extracted instance identifiers can loop back to Stage 5 for record linkage.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STAGE 6: Unstructured Enrichment                                       │
│                                                                         │
│  6a. Text extraction                                                    │
│       ─ PDF → pdfium-render, Markdown → pulldown-cmark, URL → scraper  │
│                                                                         │
│  6b. Per-document ontology extraction (strategy depends on size)        │
│                                                                         │
│    Small doc (fits in context window):                                  │
│       ─ Direct extraction: LLM reads full text, returns ontology JSON   │
│         with mandatory evidence quotes per finding                      │
│                                                                         │
│    Large doc (exceeds context window):                                  │
│       ─ Chunk by document structure (headings) if available             │
│         else chunk by token count (~3000 tokens, 10% overlap)           │
│       ─ Per-chunk evidence extraction: entity mentions + quotes         │
│         (parallel LLM calls)                                            │
│       ─ Merge chunk results into one per-document ontology              │
│         (LLM merge pass for ambiguous names)                            │
│       ─ Optional: generate summary as a byproduct (stored, shown in UI) │
│                                                                         │
│    Note: summarize-first is available as an explicit speed/cost         │
│    trade-off option, not the default. Cost estimate shown before run.   │
│                                                                         │
│  6c. Merge per-document ontologies                                      │
│       ─ Heuristic: normalise names, exact-match across docs             │
│       ─ Embedding similarity for fuzzy matches                          │
│       ─ LLM merge pass for ambiguous cases                              │
│       ─ Result: merged unstructured ontology with multi-doc evidence    │
│                                                                         │
│  6d. Reconcile with structured graph — three outcomes per proposal:     │
│                                                                         │
│       ANNOTATE  — concept maps to existing entity type or relationship  │
│                   Add evidence quote as rdfs:comment. Done in Stage 6.  │
│                                                                         │
│       NEW EDGE  — new relationship between existing entity types        │
│                   Added to the staged-changes queue (same as all other  │
│                   edits). User reviews and commits. Not written directly │
│                   into the schema graph until confirmed.                │
│                                                                         │
│       NEW TYPE  — concept not present in structured graph at all        │
│                   → Loop back to Stage 4 for consolidation decision     │
│                   (merge with something? new standalone type?)          │
│                   If the LLM also extracted instance identifiers        │
│                   (e.g. "Sub-123", "Sub-124"), those get routed to      │
│                   Stage 5 for record linkage against structured sources │
│                                                                         │
│  Every proposal carries evidence quotes + source document provenance.  │
│  User reviews in Proposals Panel.                                       │
│                                                                         │
│  The graph is considered final when: no pending loop-back proposals     │
│  remain (all NEW TYPE and instance loop-backs from Stage 6 have been    │
│  resolved in Stages 4 and 5), and Stage 7 passes with no blocking       │
│  errors. Until then, the pipeline is still open.                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Stage 7 — Validation & Release Gate

A hard gate. Export is not available until blocking errors are resolved. The RDF preview panel is available as a persistent side panel from Stage 4 onwards — it is not a step here. Ontology alignment suggestions run inline in Stage 4; Stage 7 only covers entity types added in Stage 6 that didn't go through Stage 4.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STAGE 7: Validation & Release Gate                                               │
│                                                                         │
│  7a. Blocking errors (must resolve before Export unlocks)              │
│       ─ Entity types with no subject column / URI strategy configured   │
│       ─ Duplicate RDF class names                                       │
│       ─ Virtual column SQL expressions that fail to parse               │
│                                                                         │
│  7b. Warnings (can dismiss and proceed)                                 │
│       ─ Isolated nodes (entity types with no relationships)             │
│       ─ High null rate on subject column (some rows won't get URIs)     │
│       ─ Relationships pointing to entity types with no source binding   │
│       ─ Entity types without URI minting strategy (will fall back)      │
│                                                                         │
│  7c. Ontology alignment catch-up                                        │
│       ─ For entity types added in Stage 6 that bypassed Stage 4,       │
│         run the same alignment suggestions (schema.org / Dublin Core)   │
│       ─ Optional: user accepts/skips per suggestion                     │
│                                                                         │
│  Result: validated graph. Export unlocked.                              │
└─────────────────────────────────────────────────────────────────────────┘
```

**Live RDF preview panel** — available as a toggleable side panel from Stage 4 onwards, not a stage. Shows 3–5 sample entities as Turtle triples, updating in real time as attribute mappings and virtual columns change. This means the user sees what their URIs and triple structure look like while they are mapping, not only after everything is done.

---

### Stage 8 — Export

```
┌─────────────────────────────────────────────────────────────────────────┐
│  STAGE 8: Export                                                        │
│  ─ RDF/Turtle (.ttl) — via oxigraph                                     │
│  ─ JSON-LD (.jsonld)                                                    │
│  ─ GraphML (.graphml)                                                   │
│  ─ Mermaid diagram (.md)                                                │
│  ─ Schema-only (entity types + relationships as OWL classes/properties) │
│  ─ Full export (schema + all instances streamed lazily from sources)    │
│  ─ Named graphs: optional, tags each triple with its source             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Source Adapters

Every source type gets an adapter that produces a normalized **SourceDescriptor**:

```typescript
interface SourceDescriptor {
  id: string
  kind: 'sqlite' | 'postgres' | 'mysql' | 'csv' | 'json' | 'markdown' | 'pdf' | 'webpage'
  displayName: string
  // For structured sources:
  entities?: EntityDescriptor[]
  // For unstructured sources:
  documents?: DocumentDescriptor[]
}

interface EntityDescriptor {
  id: string              // e.g. "sqlite://path/to/db::users"
  sourceId: string
  name: string            // table/file name
  attributes: AttributeDescriptor[]
  sample: Record<string, unknown>[]  // first ~100 rows
  rowCount?: number
  primaryKeys: string[]
  foreignKeys: ForeignKeyDescriptor[]
}

interface DocumentDescriptor {
  id: string
  sourceId: string
  title: string
  contentPreview: string  // first ~500 chars
  chunkCount: number
}
```

The Rust backend implements adapters. The frontend never needs to know where data came from — it just works with `SourceDescriptor` objects.

### Adapter matrix

| Source type | Schema extraction | Sample data | Full streaming |
|---|---|---|---|
| SQLite | `PRAGMA table_info` | `SELECT * LIMIT 100` | `SELECT * LIMIT ?` paginated |
| PostgreSQL | `information_schema` | row sampling | cursor-based |
| MySQL | `information_schema` | row sampling | cursor-based |
| CSV | header + type inference | first N lines | line-by-line streaming |
| JSON (custom format) | existing logic | `data.slice(0, 100)` | full load (bounded) |
| Markdown | heading structure | full text (usually small) | full load |
| PDF | none (unstructured) | extracted text preview | chunk-by-chunk |
| Web page | none (unstructured) | scraped text preview | fetch + parse |

---

## 5. Cross-source connection proposals (the hard part)

This is where the real value is. Three levels, applied in order:

### Level 1: Structural heuristics (fast, no LLM)

```
Rules:
- Same column name in two different sources → score +0.4
- Same column name (after normalizing snake_case, camelCase) → score +0.3
- One column is named "{other_table}_id" → score +0.8 (FK pattern)
- Same set of possible values in a sample (e.g. both have "US", "DE", "FR") → score +0.3
- Both are primary keys with the same pattern (UUIDs, incrementing ints) → score +0.1
```

### Level 2: Embedding similarity (medium speed, local model)

- Embed column name + 5 sample values as a short text snippet
- `"column: user_id, values: 1, 2, 3, 42, 100"` → vector
- Cosine similarity between all pairs across sources
- Score threshold (e.g. > 0.85) → proposal

Good local embedding models for this: `nomic-embed-text` via Ollama, or `all-MiniLM-L6-v2` via a bundled ONNX model (no external dependency).

### Level 3: LLM reasoning (slow, runs on demand or asynchronously)

Prompt template:
```
You are analyzing two database tables to determine if they should be connected
in a knowledge graph.

Table A (from: customers.sqlite, table: users):
  Columns: id (int, PK), name (text), email (text), country_code (text)
  Sample: [{id:1, name:"Alice", email:"alice@ex.com", country_code:"US"}, ...]

Table B (from: orders.json, entity: order):
  Columns: order_id (text), customer_id (int), total (decimal), date (date)
  Sample: [{order_id:"ORD-001", customer_id:1, total:99.99, date:"2024-01-15"}, ...]

Current knowledge graph context:
  Existing entity types: [User, Order, Product]
  Existing relationships: [Order → contains → Product]

Question: Should Table A and Table B be connected? If yes:
1. What is the relationship name (e.g. "places", "belongs_to")?
2. Which columns link them (source.column → target.column)?
3. Is this 1:1, 1:N, or M:N?
4. Confidence (0-1)?

Respond as JSON: {"connected": bool, "relationship": string, "linkColumns": {...}, "cardinality": string, "confidence": float, "reasoning": string}
```

The LLM results go through the same proposal system as FK detection — the user always confirms.

---

## 6. Stage 4 & 5 Detail: Semantic Consolidation and Identity Resolution

This section provides the detailed UI and backend design for Stages 4 and 5. The separation between stages matters:

- **Stage 4** decides *type semantics*: what entity types exist in the final graph, and what their source bindings are. No row-level logic.
- **Stage 5** decides *instance semantics*: which rows across sources refer to the same real-world entity, and how contradictory values are represented. No schema-level logic.

---

### 6a. Stage 4 entry point: the Entity Catalog

The Entity Catalog is the starting surface for Stage 4. It shows every candidate entity type from every source, pre-scored for similarity, so the user can spot consolidation candidates immediately.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ENTITY CATALOG                                  [Search...]  [Group similar]│
├──────────────┬───────────────────┬──────────┬─────────────┬─────────────────┤
│  Name        │  Source           │  Rows    │  Attributes │  Similar to     │
├──────────────┼───────────────────┼──────────┼─────────────┼─────────────────┤
│  users       │  app.sqlite       │  48,210  │  id, name,  │  ⚠ customers    │
│              │                   │          │  email, ...  │    (87% match)  │
├──────────────┼───────────────────┼──────────┼─────────────┼─────────────────┤
│  customers   │  crm.sqlite       │  51,003  │  cust_id,   │  ⚠ users        │
│              │                   │          │  full_name, │    (87% match)  │
│              │                   │          │  email, ... │                 │
├──────────────┼───────────────────┼──────────┼─────────────┼─────────────────┤
│  orders      │  app.sqlite       │  210,450 │  id, user_id│  —              │
├──────────────┼───────────────────┼──────────┼─────────────┼─────────────────┤
│  products    │  inventory.csv    │  3,200   │  sku, name, │  items (61%)    │
└──────────────┴───────────────────┴──────────┴─────────────┴─────────────────┘
```

Similarity scores come from the same heuristic + embedding pipeline used in Stage 3 for connection proposals — reused, not recomputed. These are **consolidation proposals** (merge/link/subtype decisions), strictly distinct from the **connection proposals** (relationship edges) produced in Stage 3.

---

### 6b. Side-by-side comparison panel (Stage 4)

Selecting two entity types opens a split view. The goal here is to decide *what* the canonical type is — attribute structure and source bindings. Row-level decisions (conflict policy, which rows are the same) come in Stage 5.

```
┌─────────────────────────────┬─────────────────────────────┐
│  users (app.sqlite)         │  customers (crm.sqlite)     │
│  48,210 rows                │  51,003 rows                │
├─────────────────────────────┼─────────────────────────────┤
│  id          (int, PK)      │══▶  cust_id     (int, PK)  │
│  name        (text)      ───▶    full_name   (text)      │
│  email       (text)      ═══▶    email       (text)  ✓   │
│  created_at  (date)      ───▶    signup_date (date)      │
│  country     (text)      ───▶    region      (text)      │
│  plan_id     (int)          │    ──── (no match) ────     │
│  ──── (no match) ────       │    tier        (text)      │
├─────────────────────────────┴─────────────────────────────┤
│  SAMPLE DATA (5 rows each, side by side)                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ id  name    email       │ cust_id full_name  email   │ │
│  │  1  Alice   a@x.com     │  1001   Alice M.   a@x.com │ │
│  │  2  Bob     b@x.com     │  1002   Bob K.     b@x.com │ │
│  └──────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────┤
│  Overlap estimate: ~46,000 rows match on email (91%)      │
│  (informational — row linkage configured in Stage 5)      │
│                                                            │
│  [Merge]  [Link]  [Subtype ▾]  [Keep separate]  [X]      │
└────────────────────────────────────────────────────────────┘
```

═══▶ exact name match, ───▶ inferred match, no line = unmatched. The overlap estimate is informational context for the decision — the actual row linkage is deferred to Stage 5.

Overlap estimate query (runs in background on panel open):
```sql
SELECT COUNT(*) as overlap
FROM source_a a JOIN source_b b ON lower(a.email) = lower(b.email);
```

---

### 6c. Consolidation wizard (Stage 4)

**Merge path** — two-step wizard. Decides type semantics only.

**Step 1 — Attribute mapping**

Defines the canonical attribute names for the merged entity type.

```
Merged entity type name:  [User          ]

  SOURCE A ATTRIBUTE      CANONICAL NAME        SOURCE B ATTRIBUTE
  ─────────────────────────────────────────────────────────────────
  id               ══▶   id              ◀══   cust_id
  name             ──▶   name            ◀──   full_name
  email            ══▶   email           ◀══   email
  created_at       ──▶   created_at      ◀──   signup_date
  country          ──▶   country         ◀──   region
  plan_id          ──▶   plan_id         ◀     (unmapped — source A only)
                         tier            ◀──   tier  (unmapped — source B only)

  [← Back]                                              [Confirm merge →]
```

**Confirm** — the canvas shows a single `User` node with two source bindings (app.sqlite/users + crm.sqlite/customers). Both bindings visible in the node's detail panel. Merge config saved to project SQLite.

Row linkage and conflict policy for this merged entity type are configured separately in Stage 5.

---

**Link path** — user names the relationship between the two entity types. It is written directly into the schema graph as a manual relationship (same as drawing an edge on the canvas). No routing back to Stage 3 — this is a Stage 4 schema edit, not a proposal.

**Subtype path** — user picks which is parent, which is child. Saved as an `rdfs:subClassOf` relationship in the schema graph.

---

### 6d. Stage 5: within-source row deduplication

Within a single source, finding rows that represent the same real-world entity. The dedup workflow lives in Stage 5. Stage 1 exposes a shortcut into it for obviously dirty sources (a "this data looks messy — clean it now?" prompt), but the user is always taken to the Stage 5 dedup panel to do the actual work.

**Entry point:** entity type detail panel → "Find duplicate rows" action

**Configuration panel:**

```
  Find duplicates in: User  (source: app.sqlite)

  Match rows when:
  ┌──────────────────────────────────────────────────────────┐
  │  ● email  →  [exact match ▾]                      [✕]   │
  │  ● name   →  [fuzzy match (>90%) ▾]               [✕]   │
  │  Rules combined with: [AND ▾] / OR        [+ Add rule]  │
  └──────────────────────────────────────────────────────────┘

  Strategy:
  ○ Fast (exact only, instant)
  ● Balanced (exact + blocking + fuzzy)
  ○ Thorough (all-pairs, slow for >100k rows)

  [Find duplicates]
```

**Results:**

```
  DUPLICATE GROUPS (34 found)                          [Resolve all ▾]
  ┌───┬─────────────────────────────────────────────────────────────┐
  │ ▶ │  Group 1 (2 rows)  — matched on: email                     │
  │   │  id=12   Alice Smith  alice@ex.com  2023-01-10              │
  │   │  id=847  Alice S.     alice@ex.com  2023-06-22              │
  │   │  [Keep 12]  [Keep 847]  [Merge rows]  [Not a duplicate]    │
  └───┴─────────────────────────────────────────────────────────────┘
```

Decisions stored in project SQLite, applied at export time. Source never modified.

---

### 6e. Stage 5: cross-source record linkage & conflict policy

For entity types with multiple source bindings (result of a Stage 4 merge), this step links rows across sources and defines how contradictory attribute values are handled.

**Record linkage — match key configuration:**

```
  Cross-source record linkage for: User
  Sources: app.sqlite/users  +  crm.sqlite/customers

  Match rows from both sources when:
  ● email  →  exact match (case-insensitive)
  ○ name + country  →  fuzzy match
  [+ Add rule]

  Estimated matches: ~46,000 rows (91% of larger source)
  Rows only in app.sqlite: ~2,000
  Rows only in crm.sqlite: ~5,000
```

**Conflict policy — for linked rows with differing values:**

```
  CONFLICT POLICY for: User

  When linked rows from app.sqlite and crm.sqlite disagree on a value:

  Global rule:  [Prefer app.sqlite ▾]

  Per-attribute overrides:
    email       → [Prefer app.sqlite ▾]
    name        → [Prefer crm.sqlite ▾]
    created_at  → [Prefer earlier date ▾]
    country     → [Prefer non-null ▾]
    tier        → [Keep both (named graphs) ▾]

  Rows with no match in other source:  include ✓
```

"Keep both (named graphs)" exports the conflicting values as separate triples tagged with their source — see named graphs section. The other rules apply a single winner at export time.

---

### 6f. Backend: DuckDB queries powering Stages 4 & 5

```sql
-- Overlap estimate (Stage 4 comparison panel)
SELECT COUNT(*) as overlap
FROM read_csv_auto('source_a.csv') a
JOIN sqlite_scan('source_b.db', 'customers') b
  ON lower(trim(a.email)) = lower(trim(b.email));

-- Within-source dedup: exact match (fast strategy)
SELECT a.id as id_a, b.id as id_b, a.email
FROM user_data a JOIN user_data b
  ON lower(a.email) = lower(b.email) AND a.id < b.id;

-- Within-source dedup: fuzzy name (balanced strategy)
SELECT a.id as id_a, b.id as id_b,
       jaro_winkler_similarity(a.name, b.name) as name_sim
FROM user_data a JOIN user_data b
  ON a.id < b.id
  AND jaro_winkler_similarity(a.name, b.name) > 0.9;
```

For large tables the "thorough" strategy uses blocking (group by email domain, or first letter of name) before pairwise comparison to keep queries tractable.

---

### 6g. Non-destructive by design

All decisions across Stages 4 and 5 — merges, links, subtypes, dedup resolutions, conflict policies — are stored in the project SQLite and applied at export time. Original source files and databases are never touched. Any decision can be revised or rolled back independently.

---

## 7. Project Storage (local SQLite, not just memory)

A key change from the prototype: **the project state must be persisted to disk**, not just held in React state.

Use a local `project.entitysmith` file (which is actually a SQLite database):

```sql
-- Schema graph
CREATE TABLE entity_types (
  id TEXT PRIMARY KEY,
  name TEXT,
  source_id TEXT,
  source_entity_id TEXT,
  rdf_class TEXT,
  subject_column TEXT,
  uri_strategy TEXT,  -- 'primary_source', 'natural_key', 'deterministic_uuid', 'blank_node'
  uri_strategy_key TEXT,  -- the column or expression used as input for the strategy
  created_at TEXT
);

CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  source_entity_type_id TEXT REFERENCES entity_types(id),
  target_entity_type_id TEXT REFERENCES entity_types(id),
  name TEXT,
  predicate TEXT,
  bidirectional INTEGER,
  reverse_name TEXT,
  confidence REAL,
  origin TEXT  -- 'manual', 'fk', 'llm', 'heuristic'
);

CREATE TABLE attribute_mappings (
  id TEXT PRIMARY KEY,
  entity_type_id TEXT REFERENCES entity_types(id),
  attribute_name TEXT,
  sql_expression TEXT,  -- NULL = use raw column; set = DuckDB expression e.g. CONCAT(first_name, ' ', last_name)
  rdf_predicate TEXT,
  xsd_datatype TEXT,
  omit INTEGER
);

-- Sources catalog
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  kind TEXT,  -- 'sqlite', 'csv', 'json', etc.
  display_name TEXT,
  config TEXT  -- JSON: connection string, file path, etc.
);

-- Proposals (pending user decision)
CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  kind TEXT,  -- 'connection', 'entity', 'attribute'
  status TEXT,  -- 'pending', 'accepted', 'rejected'
  payload TEXT, -- JSON
  confidence REAL,
  origin TEXT,
  created_at TEXT
);

-- Prefixes
CREATE TABLE rdf_prefixes (
  prefix TEXT PRIMARY KEY,
  iri TEXT
);

-- Change log (append-only, powers undo/redo)
CREATE TABLE change_log (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  op        TEXT,        -- 'accept_proposal', 'reject_proposal', 'merge_types',
                         --   'update_mapping', 'set_uri_strategy', 'add_source', etc.
  payload   TEXT,        -- JSON snapshot of what changed (enough to reverse)
  undone    INTEGER DEFAULT 0,
  created_at TEXT
);
```

**Undo/redo:** the `change_log` is append-only. Every user action appends one row. Undo marks the latest non-undone row as `undone = 1` and reverses its effect (the `payload` contains enough state to reconstruct the previous value). Redo marks it back. This gives arbitrarily deep undo without a separate event-sourcing system — the project SQLite is the single source of truth.

Benefits:
- Survives app restarts
- Full undo/redo history preserved across sessions
- The `.entitysmith` file can be committed to Git (single-file project, diffable history)

---

## 8. Tauri Architecture (Rust + React)

```
┌─────────────────────────────────────────────────┐
│  React Frontend (EntitySmith/src)               │
│                                                 │
│  ┌──────────────┐  ┌───────────────────────┐   │
│  │ Source Panel │  │  Schema Canvas        │   │
│  │ (sidebar)    │  │  (ReactFlow)          │   │
│  └──────────────┘  └───────────────────────┘   │
│                                                 │
│  ┌──────────────┐  ┌───────────────────────┐   │
│  │ Proposals    │  │  Data Preview         │   │
│  │ Review Panel │  │  (table, N rows)      │   │
│  └──────────────┘  └───────────────────────┘   │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Pipeline Progress (jobs, status, logs)  │  │
│  └──────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────┘
                   │ Tauri IPC (invoke + events)
┌──────────────────▼──────────────────────────────┐
│  Rust Backend (src-tauri)                       │
│                                                 │
│  ┌──────────────┐  ┌───────────────────────┐   │
│  │ Source       │  │  Project Store        │   │
│  │ Adapters     │  │  (SQLite via rusqlite) │   │
│  └──────────────┘  └───────────────────────┘   │
│                                                 │
│  ┌──────────────┐  ┌───────────────────────┐   │
│  │ Connection   │  │  LLM Client           │   │
│  │ Proposals    │  │  (Ollama / API)       │   │
│  │ Engine       │  └───────────────────────┘   │
│  └──────────────┘                              │
│                                                 │
│  ┌──────────────┐  ┌───────────────────────┐   │
│  │ Embedding    │  │  Export Engine        │   │
│  │ Engine       │  │  (RDF, JSON-LD, etc.) │   │
│  └──────────────┘  └───────────────────────┘   │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Job Queue (tokio tasks + event emitter) │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Key Tauri commands (Rust → exposed as IPC)

```rust
// Source management
#[tauri::command] async fn add_source(config: SourceConfig) -> Result<SourceDescriptor>
#[tauri::command] async fn remove_source(id: String) -> Result<()>
#[tauri::command] async fn analyze_source(id: String) -> Result<JobId>  // background

// Project
#[tauri::command] async fn open_project(path: String) -> Result<ProjectState>
#[tauri::command] async fn create_project(path: String) -> Result<ProjectState>

// Pipeline
#[tauri::command] async fn run_structured_phase() -> Result<JobId>
#[tauri::command] async fn run_enrichment_phase() -> Result<JobId>
#[tauri::command] fn get_job_status(job_id: String) -> Result<JobStatus>

// Proposals
#[tauri::command] fn list_proposals(filter: ProposalFilter) -> Result<Vec<Proposal>>
#[tauri::command] fn accept_proposal(id: String) -> Result<()>
#[tauri::command] fn reject_proposal(id: String) -> Result<()>

// Schema graph (read)
#[tauri::command] fn get_schema_graph() -> Result<SchemaGraph>

// Schema graph (write - user manual edits)
#[tauri::command] fn upsert_entity_type(et: EntityType) -> Result<()>
#[tauri::command] fn upsert_relationship(rel: Relationship) -> Result<()>
#[tauri::command] fn delete_entity_type(id: String) -> Result<()>
#[tauri::command] fn delete_relationship(id: String) -> Result<()>

// Instance data (lazy)
#[tauri::command] async fn sample_entity(entity_type_id: String, n: usize) -> Result<Vec<Row>>

// Export
#[tauri::command] async fn export_graph(format: ExportFormat, path: String) -> Result<()>
```

### Background jobs with progress events

```rust
// From Rust, emit events that React listens to:
app_handle.emit("job:progress", JobProgressEvent {
  job_id,
  phase: "analyzing sources",
  current: 3,
  total: 10,
  message: "Reading schema from orders.sqlite",
});

app_handle.emit("job:proposal", NewProposalEvent {
  proposal_id,
  kind: "connection",
  confidence: 0.87,
  summary: "users.id → orders.customer_id",
});

app_handle.emit("job:complete", JobCompleteEvent { job_id, result: "ok" });
```

---

## 9. DuckDB as the data processing layer

DuckDB is an in-process analytical database — think SQLite but column-oriented and built for analytical queries. It is an excellent fit for this pipeline.

### Why DuckDB belongs here

The core problem with writing custom source adapters for CSV, JSON, SQLite, Parquet, etc. is that you end up reimplementing sampling, type inference, and aggregation for each format. DuckDB eliminates most of this:

```sql
-- DuckDB can query these directly, no import step:
SELECT * FROM 'customers.csv' LIMIT 100;
SELECT * FROM 'orders.json' LIMIT 100;
SELECT * FROM sqlite_scan('legacy.db', 'users') LIMIT 100;

-- Cross-source JOIN for sample value overlap detection:
SELECT a.user_id, b.customer_id
FROM 'app_db.csv' a
JOIN sqlite_scan('crm.db', 'customers') b ON a.user_id = b.customer_id
LIMIT 10;

-- Column statistics for type inference and matching:
SELECT column_name, count, null_percentage, min, max, approx_unique
FROM (SUMMARIZE SELECT * FROM 'large_dataset.csv');
```

This removes the need to write custom adapters for most structured formats. DuckDB handles the parsing and the Rust code handles the graph logic.

### DuckDB's role vs. SQLite's role

They are complementary, not competing:

| | **SQLite (rusqlite)** | **DuckDB** |
|---|---|---|
| **Purpose** | Project metadata store | Data processing layer |
| **Stores** | Schema graph, proposals, source configs, prefixes | Nothing persistent — used for queries only |
| **Access pattern** | Transactional (read/write, lots of small ops) | Analytical (read-heavy, large scans, aggregations) |
| **Concurrency** | Serialized writes (fine for metadata) | Parallel columnar processing |
| **Used for** | Saving/loading project state | Sampling sources, type inference, cross-source matching, export streaming |

The project `.entitysmith` file is still SQLite. DuckDB is ephemeral — spun up for a job, runs its queries, results go into the schema graph or proposals, then closes.

### Concrete DuckDB use cases in the pipeline

**Phase 1 — Schema analysis:**
```sql
-- Infer column types from a CSV without loading everything
SELECT column_name, column_type
FROM (DESCRIBE SELECT * FROM 'orders.csv');
```

**Phase 2a — Cross-source sample value overlap (heuristic matching):**
```sql
-- Do these two columns share values? (strong FK signal)
SELECT COUNT(*) as overlap
FROM (SELECT DISTINCT user_id FROM 'app.csv') a
JOIN (SELECT DISTINCT id FROM sqlite_scan('crm.db', 'customers')) b
  ON a.user_id = b.id;
```

**Phase 2b — Column fingerprints for embedding:**
```sql
-- Build a representative sample string per column for embedding
SELECT column_name, string_agg(CAST(val AS VARCHAR), ', ') as sample_values
FROM (
  SELECT unnest(columns(*)) as col FROM (
    SELECT * FROM 'dataset.csv' USING SAMPLE 20 ROWS
  )
) PIVOT ...
```

**Phase 4 — Streaming export:**
```sql
-- Stream all rows through the mapping without loading into memory
COPY (
  SELECT id, name, email FROM 'large_users.csv'
) TO 'export_staging.parquet';
-- Then Rust reads parquet row-by-row to emit RDF triples
```

### Tradeoffs to be aware of

- **Binary size**: The `duckdb` Rust crate bundles libduckdb (~35MB). The Tauri binary will be noticeably larger than with SQLite alone. Worth it for the capability, but worth knowing.
- **Not a replacement for custom adapters**: DuckDB can't talk to live PostgreSQL or MySQL — you still need `sqlx` for remote relational databases. DuckDB handles *file-based* sources beautifully; live DB connections need their own adapter.
- **Memory usage**: DuckDB is designed to spill to disk when memory is tight, so it handles large files gracefully. But for analytical queries on massive datasets, it will use significant RAM temporarily.

### Summary

Use DuckDB as a query engine over files (CSV, JSON, Parquet, SQLite files). Use `sqlx` for live database connections (Postgres, MySQL). Use SQLite (rusqlite) for the project store. These three together cover the full adapter matrix without reinventing parsing logic.

---

## 10. LLM Integration: `aisdk` + OpenRouter

### LLM client: the `aisdk` Rust crate

All LLM interactions (connection proposals, entity extraction, enrichment) use the [`aisdk`](https://crates.io/crates/aisdk) Rust crate. This provides a unified interface regardless of which model is called.

### Gateway: OpenRouter

Rather than managing separate API keys and client SDKs for different providers, all LLM calls go through **OpenRouter** (`openrouter.ai`). This has several advantages:

- **Single API key** — user configures one key in settings
- **OpenAI-compatible API** — works with any SDK that supports the OpenAI format
- **Model flexibility** — can route to Claude, GPT-4o, Gemini, Mistral, etc. without code changes
- **Fallback & cost control** — OpenRouter supports model fallbacks and spending limits

### Configuration

```rust
// Stored in the project settings / global settings
struct LlmConfig {
    api_key: String,            // OpenRouter API key
    reasoning_model: String,    // e.g. "anthropic/claude-3.5-sonnet"
    embedding_model: String,    // e.g. "openai/text-embedding-3-small"
    max_tokens: u32,
    temperature: f32,           // low (0.1) for structured extraction
}
```

### Model routing by task

| Task | Model tier | Reasoning |
|---|---|---|
| Cross-source connection proposals | Mid (Claude Haiku, GPT-4o-mini) | High volume, needs to be cheap |
| Schema entity type naming / merging | Mid | Moderate complexity |
| Unstructured entity extraction | Mid-High (Claude Sonnet) | Accuracy matters |
| Enrichment relationship reasoning | High (Claude Sonnet, GPT-4o) | Complex reasoning |
| Embedding (cross-source matching) | Embedding-specific | `text-embedding-3-small` via OpenRouter |

The model to use for each task type should be configurable in settings, with sensible defaults.

### Structured outputs are mandatory

Never parse free-form LLM text. All LLM calls use tool/function calling with typed schemas:

```rust
// Example: cross-source connection proposal
#[derive(Deserialize, JsonSchema)]
struct ConnectionProposalOutput {
    connected: bool,
    relationship_name: String,        // e.g. "places"
    link_columns: HashMap<String, String>, // source_col → target_col
    cardinality: Cardinality,          // OneToOne, OneToMany, ManyToMany
    confidence: f32,
    reasoning: String,
}
```

The `reasoning` field is important — it gets surfaced in the proposals panel so the user can understand why the LLM suggested a connection.

### Cost awareness

LLM calls are batched where possible. For Stage 3 connection proposals across N entity type pairs, instead of N² individual calls, batch multiple pairs into one prompt:
```
"Here are 5 pairs of entity types. For each pair, propose a relationship edge if one exists..."
```

Cache results keyed by (source fingerprint + prompt hash) so re-running analysis doesn't re-spend tokens.

---

## 11. The "load everything to one format" question

You proposed loading all sources into one JSON format. Here is why I'd push back on that:

**Against full normalization to JSON:**
- A 5GB CSV would produce a 5GB+ JSON in memory. The OS will page-swap and the app freezes.
- You lose the ability to query data efficiently (WHERE clauses, indexes).
- For the canvas/schema phase, you only need column names + samples, not all data.

**What to do instead:**

```
For SCHEMA ANALYSIS: load column metadata + 100-row samples into a lightweight in-memory struct (fine, always fast)

For CROSS-SOURCE MATCHING: work with samples and embeddings, never full datasets

For EXPORT: stream lazily from each source through the mapping — a row at a time, not all at once

For PREVIEW: load paginated (page 1 of N)
```

**Where JSON normalization DOES make sense:**
- The internal graph schema representation (entity types, relationships, mappings) — this is small and JSON is perfect
- Cross-source "fingerprints" (column name + sample values hashed/embedded) for matching

---

## 12. LLM Strategy (usage philosophy)

> Full LLM integration design is covered in section "LLM Integration: `aisdk` + OpenRouter" above. This section covers the usage philosophy.

### Hosted-only, OpenRouter as gateway

All LLM calls go through OpenRouter. No self-hosted models, no Ollama dependency. Keeps the implementation simple — one API client, one key, many model choices.

### Structured outputs are mandatory

For cross-source proposals and entity extraction, always use structured/tool-call outputs — never parse free-form text. This avoids hallucinations and makes validation easy.

### LLM usage budget

Not every proposal needs an LLM. Apply the levels in order:
1. Structural heuristics (free, instant) — catch obvious FKs
2. Embedding similarity (cheap, fast) — catch semantic matches
3. LLM reasoning (costs tokens, slower) — only for uncertain cases

User can set: "Ask LLM for connections with confidence between 0.4 and 0.8" (below = skip, above = auto-accept with review).

---

## 13. Unstructured Data Enrichment — Detailed Design

The approach has three distinct sub-steps. Each produces an artifact that feeds the next.

### Step 1: Per-document ontology extraction

For each document the LLM reads the full text and produces a mini-ontology — a small structured representation of the entity types, attributes, and relationships it can find in that document.

Prompt structure:
```
You are an ontology engineer. Read the following document and extract:
1. All entity types (things the document talks about, e.g. "Customer", "Invoice")
2. For each entity type, the attributes mentioned (e.g. Customer has: name, email, tier)
3. All relationships between entity types (e.g. "Customer places Order")
4. For each finding, quote the exact sentence it came from.

Return as JSON matching this schema: { entities: [...], relationships: [...] }

Document:
---
{document_text}
---
```

The quote requirement is critical — every extracted concept is anchored to a source sentence. This is shown to the user during review so they can verify the LLM didn't hallucinate.

Result per document:
```json
{
  "source_doc": "architecture.md",
  "entities": [
    { "name": "Customer", "attributes": ["name", "email", "subscription_tier"], "evidence": "A Customer has a name, email address and subscription tier..." },
    { "name": "Invoice",  "attributes": ["id", "amount", "due_date"],           "evidence": "Each Invoice carries an ID, total amount and due date..." }
  ],
  "relationships": [
    { "from": "Customer", "to": "Invoice", "name": "receives", "evidence": "Customers receive monthly invoices..." }
  ]
}
```

### Handling large documents (context window constraint)

For documents that exceed the LLM context window, the strategy is **summarize first, then extract ontology from the summary** — not chunk-then-extract.

The reasoning: ontology extraction doesn't need every sentence in the document. It needs the conceptual structure — entity types, their key attributes, and relationships. A summary preserves exactly this and discards repetition, examples, and boilerplate. Extracting from N chunks and then merging N mini-ontologies is harder because the same concept (`Customer` in chunk 3, `Client` in chunk 12) won't be unified automatically without yet another LLM pass.

```
Large document (too big for one prompt)
        │
        ▼
  1. Split into chunks (~3000 tokens each)
        │
        ▼
  2. Summarize each chunk (parallel LLM calls)
     Prompt: "Summarize the key concepts, entity types, attributes,
              and relationships described in this section."
        │
        ▼
  3. Combine chunk summaries into one final summary (~2000 tokens)
     (one more LLM call — or simple concatenation if short enough)
        │
        ▼
  4. Run the standard ontology extraction prompt on the final summary
     (same as small documents — single call, full context)
```

The summary is stored in the project SQLite alongside the document record. It is reused if the document is re-processed and doubles as a human-readable document overview in the UI.

**Fallback for structured documents** (technical specs, API docs, documents with clear headings): skip summarization and use heading structure as chunk boundaries instead. Each section is already semantically coherent, so per-section extraction produces cleaner ontologies with much less cross-section ambiguity than arbitrary token-based chunks.

---

### Step 2: Merge per-document ontologies

All per-document ontologies are compared and unified into a single **merged unstructured ontology**.

This is itself an LLM task (with heuristic pre-processing):

**Pre-processing (heuristics, no LLM):**
- Normalize names: `Customer`, `Customers`, `customer` → all the same
- Exact-match entity types across documents and auto-merge identical names
- Build a similarity matrix for fuzzy matches (`Client` vs `Customer` — high embedding similarity)

**LLM merge pass** (for ambiguous cases):
```
You have extracted ontologies from multiple documents. Some entity types
may represent the same concept under different names. Identify which entities
should be unified and propose a canonical name for each merged group.

Document A entities: Customer, Invoice, Product
Document B entities: Client, Bill, Item, Subscription
Document C entities: Customer, Order, Product, Subscription

Similarity hints (embedding cosine):
  Customer ↔ Client: 0.91
  Invoice ↔ Bill: 0.88
  Product ↔ Item: 0.83

Return: merge groups with canonical names and reasoning.
```

Result: one merged unstructured ontology with canonical names, backed by evidence from multiple documents.

---

### Step 3: Reconcile with structured graph

The merged unstructured ontology is compared against the confirmed structured graph. Three outcomes per concept:

| Unstructured concept | Structured graph | Action |
|---|---|---|
| `Customer` | `User` entity type exists | Map `Customer` → `User`, annotate with doc evidence |
| `Subscription` | Not in graph | Propose new `Subscription` entity type |
| `Customer receives Invoice` | `User → order → Order` exists | Strengthen existing relationship, add doc citation |
| `Product has Category` | No `Category` entity type | Propose new entity type + relationship |

The user reviews these as proposals in the same proposals panel as the structured phase.

Each proposal card shows:
- The concept name and proposed action
- Which documents it came from
- The exact quote(s) that support it
- For mappings: side-by-side comparison of unstructured attributes vs structured attributes

---

### What this adds to the graph

- **New entity types** — concepts from docs not represented in any structured source
- **New relationships** — domain knowledge captured in text but not encoded as FKs
- **`rdfs:comment` annotations** — the extracted evidence quotes become literal RDF annotations on entity types and relationships (great for graph documentation)
- **Attribute enrichment** — an attribute's meaning clarified in a document ("`status_code`: 1=active, 2=suspended") can be stored as metadata on the attribute mapping

---

## 14. UI/UX Design Principles for EntitySmith

### The workflow should feel like stages, not a single screen

```
[1. Sources] → [2. Profile] → [3. Connections] → [4. Consolidate] → [5. Identity] → [6. Enrich] → [7. Validate] → [8. Export]
```

Each stage has a clear entry/exit. You can go back. The app remembers where you left off.

### The canvas is the final review, not the main input

In the prototype, users drag things onto the canvas to add them. That works for a few datasets. For 20+ tables, you don't want to drag 20 nodes.

Better: the canvas is *populated automatically* after analysis. The user then *adjusts* the auto-generated graph, rather than building from scratch.

### Proposals should be a first-class panel

A dedicated "Proposals" panel that shows:
```
┌─────────────────────────────────────────────────────────────┐
│  PENDING PROPOSALS (12)                                     │
├──────────────────────────────┬────────────────┬────────────┤
│  Connection                  │  Confidence    │  Origin    │
├──────────────────────────────┼────────────────┼────────────┤
│  User → places → Order       │  ████████ 94%  │  FK        │
│  (users.id ↔ orders.user_id) │                │            │
│  [Accept] [Modify] [Reject]  │                │            │
├──────────────────────────────┼────────────────┼────────────┤
│  User ↔ Customer             │  ██████ 78%    │  LLM       │
│  (may be same entity type)   │                │            │
│  [Merge] [Keep Separate] [?] │                │            │
├──────────────────────────────┼────────────────┼────────────┤
│  Product → in → Category     │  █████ 65%     │  Embedding │
│  (from product_catalog.pdf)  │                │            │
│  [Accept] [Modify] [Reject]  │                │            │
└──────────────────────────────┴────────────────┴────────────┘
```

Batch accept/reject, sorting by confidence, filtering by origin.

### Progress is visible and interruptible

Long-running jobs (embedding 500 PDF pages) should show progress and allow cancellation. The app should remain usable while analysis runs in the background.

---

## 15. What to keep from the prototype

These things work well and should be ported directly:

- ReactFlow canvas with drag-and-drop
- Bidirectional edge labels with `/` separator notation
- FK-based proposal generation (rewrite in Rust for speed)
- RDF class inference from table/dataset name
- Column mapping with XSD datatypes
- Prefix manager (namespace management)
- Workspace concept → rename to "Project" for clarity

---

## 16. What to change

| Prototype | EntitySmith |
|---|---|
| Everything in React state | Persisted to project SQLite file |
| Only JSON + SQLite sources | JSON, CSV, SQLite, Postgres, MySQL, Markdown, PDF, Web |
| Manual drag-to-canvas | Auto-populate canvas + manual refinement |
| FK proposals only | FK + heuristic + embedding + LLM proposals |
| No unstructured data | Full Phase 3 unstructured enrichment |
| Electron | Tauri (smaller, faster, Rust backend) |
| No persistence | Project file (.entitysmith) survives restart |
| No LLM integration | LLM integration (local Ollama + remote API) |
| Export: Turtle only | Export: Turtle, JSON-LD, GraphML, Mermaid, CSV |

---

## 17. Potential pitfalls & how to avoid them

### Pitfall 1: LLM outputs are non-deterministic
**Risk:** Users re-run analysis and get different proposals.
**Fix:** Cache LLM outputs keyed by (source fingerprint + prompt hash). Only re-run if source data changes.

### Pitfall 2: Cross-source matching produces too many false positives
**Risk:** LLM confidently suggests wrong connections, user loses trust.
**Fix:** Start conservative. Default threshold = 0.85 confidence. Let user tune. Show reasoning.

### Pitfall 3: Unstructured enrichment "invents" entities
**Risk:** LLM hallucinates entity types that don't actually exist.
**Fix:** Require unstructured proposals to cite the exact text chunk they came from. Show the quote in the proposal card. User can verify before accepting.

### Pitfall 4: Merging "User" and "Customer" entity types
**Risk:** LLM suggests two entity types are the same. Merging is destructive and hard to undo.
**Fix:** Never auto-merge. Always require explicit user action. "Merge" creates a new type + redirect relationships. Original types become "archived" (soft delete, can restore).

### Pitfall 5: Huge databases with thousands of tables
**Risk:** A data warehouse schema with 800 tables — auto-populate would be chaos.
**Fix:** Cluster tables by FK relationships first. Show clusters as collapsible groups on canvas. User can expand a cluster to see individual tables.

### Pitfall 6: Remote DB connections failing mid-analysis
**Risk:** Postgres connection drops during analysis. State is corrupted.
**Fix:** Each step writes to the project SQLite file before proceeding. Resume from last checkpoint.

---

## 18. Technology decisions for EntitySmith

### Rust crates

**Core infrastructure**
- `rusqlite` — SQLite project store (schema graph, proposals, prefixes)
- `duckdb` — data processing layer (CSV/JSON/SQLite file queries, sampling, type inference, export)
- `sqlx` — live Postgres/MySQL connections (remote databases)
- `tokio` — async runtime + job queue
- `rayon` — data parallelism for CPU-bound tasks (processing many files in parallel)
- `tracing` — structured logging throughout the pipeline (essential for debugging long jobs)
- `anyhow` + `thiserror` — error handling
- `serde` + `serde_json` — serialization

**Document parsing**
- `pdfium-render` — PDF text extraction (more complete than pdf-extract, handles complex layouts)
- `scraper` — HTML/web page parsing
- `pulldown-cmark` — Markdown parsing
- `encoding_rs` — character encoding detection for legacy CSV files (Latin-1, Windows-1252, etc.)

**LLM & embeddings**
- `aisdk` — unified LLM client (OpenRouter gateway)
- `reqwest` — HTTP client (OpenRouter API calls, web scraping)
- `fastembed-rs` — local embedding inference via bundled ONNX models (all-MiniLM-L6-v2, BGE-small); used when user chooses local embedding mode

**String & data matching**
- `strsim` — string similarity algorithms (Jaro-Winkler, Levenshtein, Sørensen-Dice) for column name fuzzy matching in the heuristic proposal engine; no LLM needed for obvious cases like `user_id` ↔ `userId`
- `lingua` — language detection for documents before LLM processing (route to correct prompt language)

**Graph processing**
- `petgraph` — graph data structures and algorithms for internal graph operations: cycle detection, connected component clustering (grouping FK-connected tables), topological sort for export ordering
- `oxigraph` — embedded RDF quad store with full SPARQL support; use as the export engine rather than manually serializing Turtle strings. Also enables a SPARQL query interface in the app.

**Tauri plugins**
- `tauri-plugin-store` — key-value persistence for app-level settings (OpenRouter API key, preferred models, UI preferences)
- `tauri-plugin-notification` — desktop notification when a long background job completes
- `tauri-plugin-updater` — auto-updates

### Frontend
- ReactFlow — canvas (keep from prototype)
- **Glide Data Grid** (`@glideapps/glide-data-grid`) — all table views (source browser, instance data preview, entity catalog, dedup results, attribute mapping table). Canvas-based rendering handles millions of rows without virtualisation overhead. Supports inline editing, custom cell renderers, and frozen columns — all needed for the data editing surfaces in Stage 1 and Stage 2.
- TanStack Query — caching Tauri IPC calls, background refetch on job completion
- Zustand — client-side state
- shadcn/ui + Tailwind — UI components (already in prototype)
- Sonner — toast notifications
- `react-resizable-panels` — split-pane layout for the side-by-side comparison view in deduplication, and for the canvas + detail panel layout
- `cmdk` — command palette (Cmd+K); lets power users jump between stages, trigger analysis jobs, search entity types without touching the mouse
- `recharts` — charts for data quality metrics in the source browser (null percentage, value distribution, row counts per source)
- `@codemirror/view` — lightweight code editor for the RDF/Turtle output preview and for SPARQL queries; much lighter than Monaco

### Formats
- Project file: SQLite (`.entitysmith`)
- Export: Turtle (`.ttl`), JSON-LD (`.jsonld`), GraphML (`.graphml`), Mermaid (`.md`)

---

## 19. Additional ideas & improvements

### Data quality metrics in the source browser

Before the user builds any graph, show them a data quality overview per entity type. People often don't know how dirty their data is until they see it laid out:

```
  users (app.sqlite)  —  48,210 rows

  ATTRIBUTE        TYPE     NULL%    UNIQUE    SAMPLE VALUES
  ─────────────────────────────────────────────────────────
  id               int      0%       100%      1, 2, 3, ...
  name             text     0%       94%       "Alice", "Bob", ...
  email            text     2.1%     99%       "alice@ex.com", ...
  country          text     11.4%    —         "US"(41%), "DE"(18%), ...
  plan_id          int      34.2%    —         1(55%), 2(32%), 3(13%)
```

This is free — DuckDB's `SUMMARIZE` statement generates all of it in one query. High null percentages and suspicious value distributions surface problems before they corrupt the graph.

---

### Relationship cardinality inference from sample data

When a connection proposal is generated (FK or LLM), automatically infer the cardinality from the actual data:

```sql
-- Is orders.user_id → users.id a 1:N or M:N?
SELECT
  COUNT(*) as total_rows,
  COUNT(DISTINCT user_id) as distinct_users,
  MAX(cnt) as max_orders_per_user
FROM (SELECT user_id, COUNT(*) as cnt FROM orders GROUP BY user_id);
-- max_orders_per_user > 1 → 1:N confirmed
```

Show this in the proposal card: "Each User has on average 4.3 Orders (max: 210)". Helps the user name the relationship correctly (not just "has" but "places").

---

### Ontology alignment suggestions (schema.org, Dublin Core)

When entity types are named and finalized, suggest mappings to well-known public ontologies. This improves interoperability of the exported RDF enormously:

- `User` → `schema:Person`
- `Product` → `schema:Product`
- `Order` → `schema:Order`
- `name` attribute → `schema:name`
- `email` attribute → `schema:email`
- `created_at` attribute → `dc:created`

The LLM is well-suited to this: prompt it with the entity type name + attributes and ask it to suggest the best schema.org or Dublin Core mapping for each. Show as optional proposals — user can accept, modify, or skip entirely.

---

### SPARQL query interface

Once `oxigraph` is the export backend, the app already has a full RDF quad store in memory during export. Exposing a simple SPARQL query panel costs almost nothing and gives power users a huge amount of flexibility:

```sparql
SELECT ?person ?email WHERE {
  ?person a ex:User ;
          ex:email ?email ;
          ex:country "DE" .
}
```

This turns EntitySmith from a one-way export tool into an interactive graph query tool. Users can validate their graph before exporting it.

---

### Graph validation & warnings

Before export, run a validation pass and surface warnings:

- **Isolated nodes** — entity types with no relationships (probably means a connection was missed)
- **Missing subject column** — entity type has no primary key configured (RDF URIs will be meaningless)
- **High null rate on subject column** — some rows won't generate valid URIs
- **Duplicate RDF class names** — two entity types mapped to the same `rdf:type`
- **Circular 1:1 relationships** — A → B and B → A both as 1:1 (probably a modelling mistake)

These show as a validation panel the user can review before committing to export. None are blockers — just warnings.

---

### Incremental re-processing

When a source file changes (the CSV gets updated, new rows added to the DB), re-running the full pipeline from scratch wastes time. Track a fingerprint per source (file modification time + row count hash). On re-run, only re-process sources whose fingerprint changed.

For the structured graph: show a diff — "Since last analysis: 3 new columns in orders table, users table grew by 2,400 rows." User decides whether to re-run connection proposals.

---

### LLM result caching

LLM calls are expensive and slow. Cache every call keyed by `hash(prompt + model)` in the project SQLite. If the user re-runs analysis without changing sources, zero new LLM calls are made — all results come from cache. Cache is invalidated per-source when the source fingerprint changes.

---

### Command palette (Cmd+K)

A command palette (`cmdk`) is especially valuable for a tool with multiple stages and many actions. Examples of what it enables without mouse navigation:

```
> Add source          → opens source dialog
> Run analysis        → triggers Stage 2 pipeline
> Export as Turtle    → starts export
> Jump to: User       → focuses User node on canvas
> Find duplicates in: Orders → opens dedup panel
> Undo last accept    → reverts last proposal decision
```

This is a small frontend addition with high impact for the kind of power users who will use a knowledge graph tool.

---

### Embedding mode: local vs. cloud (user's choice)

An OpenRouter API key is **mandatory** — the app requires it on first launch before anything LLM-related runs. This keeps the implementation simple (one auth path, no degraded-mode logic for core features).

Within that constraint, the user can choose where embeddings are computed:

```
EMBEDDING MODE SETTING
┌─────────────────────────────────────────────────────────────┐
│  ○ Local  — fastembed-rs (bundled ONNX model, ~80MB)        │
│             Runs on your machine. Slower on weak hardware.   │
│             No extra API cost. Fully private.               │
│                                                             │
│  ● Cloud  — OpenRouter (text-embedding-3-small or similar)  │
│             Uses your API key. Fast on any hardware.        │
│             Small per-call cost. Data leaves your machine.  │
└─────────────────────────────────────────────────────────────┘
```

Both modes produce the same output (float vectors) and plug into the same matching pipeline. The choice is purely about performance vs. privacy vs. cost. Default: cloud (simpler, faster, consistent with the rest of the LLM usage).

`fastembed-rs` is kept as a Rust dependency regardless, because it also powers the per-chunk document summarisation step without needing an API round-trip for every chunk.

---

## 20. Further pipeline ideas & improvements

### Soft FK detection

In practice, most production databases don't have FK constraints defined — especially MySQL (historically used InnoDB without FKs), legacy schemas, or databases where constraints were dropped for performance. The app would miss most real relationships if it only looks at declared FKs.

**Soft FK detection**: scan all column pairs across all tables in a source and flag pairs where one column's values are a subset of another column's values:

```sql
-- Does orders.user_id only contain values that exist in users.id?
SELECT COUNT(*) as violations
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
WHERE u.id IS NULL;
-- violations = 0 → strong FK candidate
```

Run this for every column that looks like a foreign key (integer or UUID, named `*_id` or `*_fk`, low null rate). Produces the same proposals as declared FKs but for undeclared ones. DuckDB makes this fast even on large tables via ANTI JOIN.

---

### Source-specific RDF namespaces

For a project with multiple sources, a single `ex:` namespace gets crowded fast — `ex:User`, `ex:Customer`, `ex:Product` from three different databases all mixed together. When entity types come from different sources they should get source-scoped prefixes by default:

```
app.sqlite    → app:User, app:Order
crm.sqlite    → crm:Customer, crm:Contact
inventory.csv → inv:Product, inv:Category
```

After schema merging, the canonical merged entity type gets the prefix of its "primary" source. The prefix manager (already in the prototype) handles this, but it should be pre-populated automatically from source names rather than requiring manual entry.

---

### RDF named graphs for provenance

When exporting instances, every triple should know where it came from. RDF named graphs (quads) solve this:

```turtle
# From app.sqlite:
GRAPH <source:app.sqlite> {
  ex:User_1 a ex:User ;
            ex:email "alice@ex.com" .
}

# Same person from crm.sqlite (after merge):
GRAPH <source:crm.sqlite> {
  ex:User_1 a ex:User ;
            ex:email "alice@example.com" .  # different value!
}
```

This makes conflicts visible in the exported graph rather than silently resolved. A SPARQL query can ask "show me all users where app.sqlite and crm.sqlite disagree on email" — extremely useful for data quality work. `oxigraph` supports named graphs natively.

---

### Conflict detection (different from deduplication)

Deduplication is about rows that represent the same real-world entity and should be merged. Conflicts are about rows that represent the same entity but have *contradictory data* — different emails, different addresses, different status codes.

These need separate treatment in the UI. Deduplication says "pick one". Conflicts say "these disagree — which source is authoritative?" Both are Stage 5 concerns. Conflicts surface in the conflict policy panel (section 6e), separate from the dedup flow:

```
CONFLICTS DETECTED (12)

  User #1042: email differs
    app.sqlite:  alice@company.com
    crm.sqlite:  alice@gmail.com
    [Mark app as authoritative]  [Mark crm as authoritative]  [Keep both]

  User #2801: name differs
    app.sqlite:  "Bob K."
    crm.sqlite:  "Robert Koch"
    [Mark app as authoritative]  [Mark crm as authoritative]  [Keep both]
```

Decisions are stored in project SQLite and applied at export time.

---

### Multi-hop relationship inference

If the structured graph contains:
```
User → places → Order
Order → contains → Product
```

The app could suggest a derived relationship:
```
User → purchases → Product  (inferred via User→Order→Product)
```

This is a materialised join — `SELECT DISTINCT user_id, product_id FROM orders JOIN order_items`. Useful for graph consumers who want direct connections without traversing intermediate nodes. Show as optional "derived relationship" proposals, clearly labelled as computed, with the hop path shown. User can accept them as first-class edges in the exported graph.

---

### Export preview (RDF sample before full run)

Full export of a large database can take minutes. Before running it, show the user what 3–5 sample entities look like as RDF triples — one full entity with all its attributes and all its outgoing relationships rendered as Turtle. Catches mapping mistakes (wrong predicate names, wrong datatypes, ugly URIs) before processing millions of rows.

```turtle
# Preview: User #1 (from app.sqlite)
ex:User_1 a ex:User ;
           ex:name "Alice Smith"^^xsd:string ;
           ex:email "alice@ex.com"^^xsd:string ;
           ex:createdAt "2023-01-10"^^xsd:date ;
           ex:placesOrder ex:Order_ORD001, ex:Order_ORD047 .
```

The user can edit the mapping, regenerate the preview, and iterate until it looks right.

---

### Composite primary keys

Many tables don't have a single PK column — they have composite PKs (e.g., `order_id + line_item_id` together identify a row). The current data model assumes one `subjectColumn`. This needs extending:

```rust
enum SubjectStrategy {
  SingleColumn(String),             // "id"
  CompositeColumns(Vec<String>),    // ["order_id", "line_item"]  → URI: ex:OrderItem_1_2
  GeneratedUUID,                    // mint a new UUID for each row (no natural key)
}
```

DuckDB's PRAGMA and `information_schema` both expose composite PKs. The RDF URI for a composite-keyed row uses all PK values joined: `ex:OrderItem_1_2`.

---

### Apache Arrow IPC for frontend data transfer

The Rust → React bridge currently serialises data as JSON. For large result sets (previewing 5000 rows of a table in Glide Data Grid), JSON serialisation is slow and produces large payloads.

Apache Arrow IPC is a zero-copy binary format that Glide Data Grid can consume directly via `apache-arrow` (JS). The Rust backend emits Arrow record batches; the frontend reads them without parsing. For a 10k-row preview this is ~10x faster than JSON and uses ~3x less memory.

The `arrow2` Rust crate handles this on the backend side. Not a day-one concern, but worth planning for — it's easier to design the IPC interface for Arrow from the start than to retrofit it later.

---

### Staged graph changes (git-style diff before commit)

When reviewing proposals, the user is making many small decisions that collectively reshape the graph. A "staged changes" view before they commit shows the full diff:

```
PENDING CHANGES (before committing)
─────────────────────────────────────
  + Entity type: Subscription (from architecture.md)
  + Relationship: User → subscribes → Subscription
  ~ Renamed: Customer → User (merged from crm.sqlite)
  ~ Added attribute: User.tier (from crm.sqlite)
  - Removed: duplicate relationship User → has → Order
```

User can commit all, or deselect individual changes. Committed changes write to project SQLite; pending changes are ephemeral. This maps cleanly onto the existing `proposals` table — "commit" = bulk-accept all staged proposals.

---

### Graph canvas layout: FK-cluster grouping

ReactFlow's default layout places nodes arbitrarily. For a schema with 20 tables, auto-layout using FK density produces a much more readable graph:

- Group tables that are heavily FK-connected into visual clusters (use `petgraph`'s connected components algorithm on the FK graph)
- Put clusters far apart from each other
- Within a cluster, use a radial or hierarchical layout with the most-referenced table at the centre

This runs as a one-time layout pass when the canvas is first populated, then the user can freely rearrange. `petgraph` already handles the graph algorithm; ReactFlow's `layouted` nodes handle the positioning.

---

## 21. Decisions made

| Question | Decision |
|---|---|
| **Instance-level export** | User chooses at export time: schema-only (OWL classes + properties) or full RDF graph (schema + all instances as individuals). Both are standard RDF. Full export streams lazily from sources. |
| **LLM configuration** | Global app settings. One OpenRouter API key for the whole app. Per-project model overrides allowed. |
| **Collaborative use** | Single-user only. Not a priority. The `.entitysmith` project file is portable and can be shared manually or via Git, but no real-time collaboration. |
| **Version control / history** | Supported via append-only `change_log` table in project SQLite (see section 7). Full undo/redo, persisted across sessions. |
| **Named graphs (RDF provenance)** | Used automatically and only when a user sets conflict policy to "Keep both" for an attribute in Stage 5. Not a global toggle — it activates per-attribute as a natural consequence of that choice. |

## 22. Questions still open (decide before building)

*No open questions remaining.* All decisions have been made.

---

## 23. Recommended first steps (if starting the Tauri rewrite now)

1. **Port the core data model** — Rust structs matching `EntityDescriptor`, `SchemaGraph`, `Relationship`, project SQLite schema.
2. **Source adapters: SQLite + JSON** — Already have working JS logic, translate to Rust. These cover the prototype's use cases.
3. **Project persistence** — Open/create project files. Save/load schema graph. This is the foundational change vs. the prototype.
4. **Port the ReactFlow canvas** — Bring over the prototype's canvas, but now it reads from/writes to Tauri IPC instead of React state.
5. **Add CSV adapter** — Relatively simple: header inference + type detection.
6. **Add FK proposal engine in Rust** — Fast, no LLM needed, high value.
7. **Add the proposals review UI** — Centralized proposal panel.
8. **Add embedding-based cross-source matching** — User configures embedding mode (local via `fastembed-rs` or cloud via OpenRouter).
9. **Add LLM connection proposals via OpenRouter** — Now the pipeline fully shines.
10. **Add Markdown/PDF enrichment** — The most exciting but most complex part. Leave for last.

---

*This document is a living brainstorm. Update it as decisions are made.*
