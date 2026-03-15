# EntitySmith Implementation Plan

## 1. Purpose

This plan turns the design in `BRAINSTORM.md` into an implementation roadmap for the codebase as it exists today.

The main constraint is that the repository currently contains:

- A relatively feature-rich Electron prototype in `apps/electron`
- A mostly empty Tauri app scaffold in `apps/EntitySmith`
- A docs app in `apps/docs` that should track architecture and usage decisions as the rewrite proceeds

The plan therefore assumes a **Tauri rewrite with selective reuse of prototype UI patterns and logic**, not a direct feature port line-by-line.

---

## 2. Outcome Definition

The target product is a local-first desktop app that lets a user:

1. Create or open a persisted EntitySmith project file.
2. Register structured and unstructured sources.
3. Profile structured sources automatically.
4. Generate relationship proposals and review them.
5. Consolidate entity types into a canonical schema graph.
6. Resolve identity and conflict policies for instance-level export.
7. Enrich the graph from unstructured sources.
8. Validate the graph and export schema-only or full RDF-based outputs.

The implementation should preserve the core principles from `BRAINSTORM.md`:

- Source data is never mutated.
- Every important suggestion and decision is non-destructive and auditable.
- The schema graph is distinct from instance data.
- Provenance is attached to proposals, decisions, and exports.
- Large datasets are processed lazily and analytically rather than fully normalized in memory.

---

## 3. Current-State Assessment

## 3.1 What already exists

- `apps/electron` already contains useful reference implementations for:
  - Dataset and workspace management
  - A ReactFlow-based RDF/schema canvas
  - Connection proposal UI patterns
  - Preview-oriented renderer state
  - Basic inference helpers and data-table UX
- `apps/EntitySmith` currently contains only the default Tauri greeting template.
- `apps/docs` already contains architecture and component documentation for the Electron app, and can be extended to document the rewrite.

## 3.2 What does not exist yet

- No project file or persistence model for EntitySmith
- No Rust domain model
- No source adapter layer in Rust
- No DuckDB integration
- No proposal engine in Rust
- No job system
- No real frontend architecture in the Tauri app
- No validation/export pipeline
- No unstructured enrichment implementation

## 3.3 Architectural direction

The rewrite should be organized around three explicit layers:

- Frontend: React UI in `apps/EntitySmith/src`
- Backend: Rust services and Tauri commands in `apps/EntitySmith/src-tauri/src`
- Storage/processing: SQLite for project state, DuckDB for analytical queries, source systems/files as read-only inputs

This separation matters because many prototype concerns are currently mixed into frontend state and should move behind IPC in the Tauri version.

---

## 4. Delivery Strategy

The implementation should be split into **three delivery tracks** that run in parallel where possible:

- Track A: Foundation and platform
- Track B: Core structured-data workflow (Stages 1-5 and 7-8)
- Track C: Unstructured enrichment and advanced intelligence (Stage 6 plus advanced Stage 3/4/5 helpers)

Recommended product sequencing:

1. Ship a thin but real persisted project workflow.
2. Ship structured-source ingestion and profiling.
3. Ship schema graph editing and proposal review.
4. Ship identity resolution and export.
5. Ship enrichment, embeddings, and LLM-driven features last.

This matches the brainstorm’s recommended first steps and keeps the first usable product focused on deterministic functionality before cost-bearing AI features are introduced.

---

## 5. Implementation Phases

## Phase 0: Technical Reset and Repository Preparation

### Goal

Convert `apps/EntitySmith` from a template into a real application shell and establish conventions that will survive the full rewrite.

### Deliverables

- Define top-level app architecture for `apps/EntitySmith`
- Introduce shared naming conventions for:
  - project
  - source
  - entity type
  - relationship
  - proposal
  - provenance
  - job
- Add baseline linting/formatting/test commands for the Tauri app
- Add initial docs pages in `apps/docs` for the new Tauri architecture
- Decide whether shared frontend types live:
  - directly in the Tauri frontend app, or
  - in a new shared package consumed by frontend only, with Rust equivalents maintained separately

### Concrete work

- Replace the template `greet` command and UI.
- Create a frontend folder structure such as:
  - `src/app`
  - `src/features`
  - `src/components`
  - `src/lib`
  - `src/hooks`
  - `src/types`
- Create a Rust module structure such as:
  - `src-tauri/src/commands`
  - `src-tauri/src/domain`
  - `src-tauri/src/project_store`
  - `src-tauri/src/adapters`
  - `src-tauri/src/jobs`
  - `src-tauri/src/proposals`
  - `src-tauri/src/export`
  - `src-tauri/src/llm`

### Exit criteria

- Tauri app launches with a real shell, not the template
- The project compiles cleanly in both frontend and Rust
- The repository has a documented implementation structure

---

## Phase 1: Domain Model and Project Persistence

### Goal

Build the durable core of EntitySmith: a persisted project file backed by SQLite and represented by Rust domain types.

### Deliverables

- Project SQLite schema matching the brainstorm’s storage model
- Rust structs for all first-order concepts
- Open/create project commands
- Project migrations and versioning
- Undo/redo-capable change logging skeleton

### Primary domain types

- `ProjectState`
- `SourceDescriptor`
- `SourceConfig`
- `EntityType`
- `Relationship`
- `AttributeMapping`
- `Proposal`
- `ProposalStatus`
- `ProposalKind`
- `ProvenanceRecord`
- `JobStatus`
- `ValidationIssue`
- `ExportFormat`
- `UriStrategy`
- `ConflictPolicy`

### Storage implementation details

- Use `rusqlite` for the `.entitysmith` project file
- Implement schema migrations from day one
- Version the project schema explicitly
- Store structured payloads that may evolve as JSON blobs only where relational columns are not worth normalizing
- Ensure every mutating operation writes both:
  - the primary table changes
  - a `change_log` entry sufficient for reversal

### Decisions to lock in during this phase

- Exact project file extension and naming rules
- Migration strategy for future versions
- Whether IDs are UUIDv7, ULID, or deterministic strings
- How timestamps are stored
- How provenance evidence is serialized

### Frontend surface area

- Welcome/open/create project screen
- Recent-project list
- Project-level layout shell with empty states for future stages

### Exit criteria

- User can create a new project file and reopen it
- Empty project state round-trips correctly
- Schema migrations are tested
- Change log entries are generated for at least a few representative mutations

---

## Phase 2: Source Registration Framework

### Goal

Allow projects to register sources and persist source metadata cleanly before full analysis is implemented.

### Deliverables

- Source catalog model in Rust and SQLite
- Add/remove/list source commands
- Frontend source browser/sidebar
- Source configuration forms for the first source kinds

### Source rollout order

1. SQLite file
2. JSON file
3. CSV file
4. Markdown folder/file
5. PDF file
6. URL/web source
7. Live PostgreSQL/MySQL only after file-based flows are solid

### Why this order

- SQLite and JSON map directly to the current prototype’s strongest use cases
- CSV is a high-value low-complexity addition
- Unstructured registration can exist before full enrichment, because registration is separate from processing
- Remote DB adapters add network, credential, and resilience complexity and should not block the first usable release

### Concrete backend work

- Implement source descriptor validation
- Persist source config safely
- Normalize source identity and display naming
- Define adapter capability metadata, for example:
  - can profile
  - can sample
  - supports schema introspection
  - supports lazy export
  - supports enrichment

### Frontend work

- Source registration drawer/modal
- Source list grouped by source type
- Source detail panel placeholder for profiling results

### Exit criteria

- User can register and remove at least SQLite, JSON, and CSV sources
- Source metadata persists across restarts
- Invalid source configurations fail with clear errors

---

## Phase 3: Structured Source Adapters and Profiling Engine

### Goal

Implement Stage 2 so every structured source can produce schema metadata, samples, and profiling artifacts.

### Deliverables

- Adapter trait/interface in Rust
- SQLite adapter
- JSON adapter
- CSV adapter
- DuckDB integration for analytical profiling
- Persisted source-profile records

### Required profiling outputs

- Entity/table/file descriptors
- Column names and inferred types
- Declared PKs and FKs where available
- Heuristic PK candidates
- Null percentage
- Approximate uniqueness
- Top values
- Min/max where meaningful
- Source fingerprint for cache invalidation

### Adapter strategy

- Use native Rust logic where source-specific metadata is required
- Use DuckDB for analytical queries over file-based structured sources
- Use source-specific SQL introspection for SQLite metadata
- Design adapters so later PostgreSQL/MySQL support can plug into the same profiling contracts

### Data model additions

- `source_entities`
- `source_attributes`
- `source_profiles`
- `source_fk_candidates`
- `source_fingerprints`

These may live as separate tables or partly as JSON payloads, but they should be queryable enough to drive proposal generation and UI filtering.

### Frontend work

- Source profile panel
- Attribute-statistics table
- Indicators for suspicious data quality issues
- Job progress feedback while profiling runs

### Exit criteria

- Registering a structured source triggers profiling automatically
- Profile results are persisted and reload correctly
- The UI can inspect profile details per source entity
- Re-running profiling correctly invalidates stale fingerprints/results

---

## Phase 4: Job System and Progress/Event Infrastructure

### Goal

Introduce the background execution model required by nearly all expensive stages.

### Deliverables

- Job registry in Rust
- Job lifecycle model:
  - queued
  - running
  - completed
  - failed
  - canceled
- Tauri events for progress, new proposals, completion, and failures
- Frontend job center / progress panel

### Why this phase matters early

Stage 2 profiling, Stage 3 proposal generation, Stage 6 enrichment, and export all need background execution. Implementing the job system early avoids rewriting synchronous commands later.

### Backend concerns

- Concurrency limits
- Cancellation support
- Structured logs per job
- Safe shared access to project store
- Clear mapping between job results and persisted artifacts

### Frontend concerns

- Live progress stream
- Persistent completed/failed job history in-session
- Non-blocking UX for long-running work

### Exit criteria

- Profiling runs through the job system
- Events reach the frontend reliably
- Failures produce actionable UI feedback

---

## Phase 5: Schema Graph Core and Manual Editing

### Goal

Establish the canonical schema graph as a first-class persisted artifact and port the canvas concept from the Electron prototype.

### Deliverables

- Persisted schema graph commands:
  - get
  - create/update entity type
  - create/update relationship
  - delete entity type
  - delete relationship
- ReactFlow-based canvas in the Tauri frontend
- Sidebar/catalog views for entity types and relationships
- Manual graph editing with persisted state

### Reuse opportunities from the prototype

- Canvas interaction patterns from `apps/electron/src/renderer/src/components/rdf-view`
- Node/edge editing affordances
- Existing naming/mapping UI concepts where still appropriate

### What should not be copied directly

- Frontend-only graph state as the source of truth
- Electron-specific assumptions
- In-memory-only proposal lifecycle

### Additional decisions in this phase

- Node ID strategy across source-local and canonical entities
- How source-bound entity types become canonical entity types after consolidation
- Whether “source entity” and “canonical entity type” are different objects in storage and UI

### Recommended model

Treat these as separate concepts:

- Source entity: discovered from an input source during profiling
- Canonical entity type: a user-approved schema node used for mapping and export

This gives Stage 4 somewhere real to operate instead of mutating source-discovered entities directly.

### Exit criteria

- User can inspect and manually edit a persisted schema graph
- Graph survives restarts
- The canvas is backed by IPC, not ephemeral local state

---

## Phase 6: Stage 3 Candidate Graph Generation

### Goal

Generate and review relationship proposals between entity types, starting with deterministic methods and layering in expensive methods later.

### Deliverables

- Proposal engine infrastructure
- Proposal persistence
- Proposal review panel
- Accept/reject/modify workflows
- Provenance rendering in UI

### Implementation order for proposal methods

1. Declared FK detection
2. Soft FK heuristics
3. Column-name similarity heuristics
4. Sample-value overlap
5. Embedding similarity
6. LLM reasoning for ambiguous cases

### Rationale

This ordering delivers value quickly and keeps precision high early. It also avoids introducing model costs before the deterministic path is stable and measurable.

### Proposal model requirements

Every proposal should include:

- stable ID
- kind
- status
- source entity/type references
- target entity/type references
- suggested predicate/cardinality
- confidence
- origin
- provenance details
- evidence payloads
- affected fields if user modifies before accepting

### Frontend work

- Proposal inbox/panel
- Sorting by confidence
- Filtering by origin/status
- Proposal detail drawer with evidence and rationale
- Batch actions where safe

### Persistence work

- Accept/reject writes to both:
  - schema graph or related downstream tables
  - change log

### Exit criteria

- Stage 3 can generate a useful set of deterministic proposals
- User can review and accept them into the graph
- Accepted/rejected state persists

---

## Phase 7: Stage 4 Semantic Consolidation

### Goal

Support the move from source-local entity candidates to a coherent canonical ontology.

### Deliverables

- Entity catalog UI
- Side-by-side comparison panel
- Consolidation wizard
- Merge/link/subtype/keep-separate actions
- Attribute-mapping editor
- Virtual column support via DuckDB SQL expressions
- Inline ontology alignment suggestions scaffold

### Core challenge

This stage changes the meaning of the graph. Stage 3 creates candidate relationships; Stage 4 decides what the nodes actually are. The implementation must therefore remap accepted Stage 3 edges after consolidation decisions.

### Recommended data behavior

- Merges should create or update canonical entity types and attach multiple source bindings.
- Link decisions should preserve separate canonical nodes plus a relationship.
- Subtype decisions should persist subclass relationships distinctly from ordinary graph relationships.
- Keep-separate should close the proposal without changing canonical structure.

### Attribute mapping subsystem

This should support:

- Raw column to RDF predicate mapping
- Optional datatype mapping
- Omit/include toggles
- DuckDB SQL expression-backed virtual attributes
- Live sample preview
- Parse/validation errors without mutating source data

### UX work

- Comparison panel showing:
  - names
  - source provenance
  - attribute overlap
  - sample rows
  - existing relationships
- Mapping editor with immediate preview impact
- A persistent RDF sample preview side panel beginning in this phase

### Exit criteria

- Users can create canonical entity types through consolidation decisions
- Attribute mappings and virtual columns are persisted
- Stage 3 edges are remapped or flagged for revalidation after consolidation changes

---

## Phase 8: Stage 5 Identity Resolution and Conflict Policy

### Goal

Implement instance-level linkage, URI generation, and conflict resolution required for full graph export.

### Deliverables

- Within-source deduplication workflows
- Cross-source record linkage workflows
- URI strategy configuration
- Conflict review panel
- Persisted linkage/conflict policy state

### Implementation order

1. URI strategy configuration
2. Exact-match record linkage
3. Within-source duplicate grouping
4. Cross-source linkage review UI
5. Conflict policy resolution
6. Fuzzy matching and more advanced linkage modes

### Reason for this order

URI minting and exact-match linkage are prerequisites for useful full export. Advanced deduplication can come later without invalidating the core model.

### Required backend capabilities

- Match-key definition per entity type
- Linked-record storage
- Conflict group generation
- Policy application model for:
  - prefer source A
  - prefer source B
  - prefer non-null
  - prefer most recent
  - keep both

### Export implication

The implementation must be explicit about when named graphs are emitted:

- only for attributes resolved as “keep both”
- with source provenance attached at triple generation time

### Exit criteria

- Full-export preconditions can be configured for at least one merged canonical entity type
- URI generation is stable and testable
- Conflict decisions persist and affect preview/export behavior

---

## Phase 9: Validation, Release Gate, and Export

### Goal

Implement the path from a configured graph to real deliverables.

### Deliverables

- Validation engine
- Blocking-error and warning model
- Release-gate UI
- Export engine for prioritized formats

### Export order

1. Turtle
2. JSON-LD
3. Schema-only export mode
4. Full instance export mode
5. Named graphs when conflict policy requires them
6. GraphML
7. Mermaid

### Why this order

Turtle and JSON-LD cover the core semantic-web use case. GraphML and Mermaid are useful but secondary.

### Validation rules to implement first

- Missing subject column / URI strategy
- Duplicate RDF class names
- Invalid virtual column expressions
- Unbound relationships
- Missing required mappings for export mode

### Preview subsystem

The RDF preview should become trustworthy enough to act as a pre-export inspection tool. It should show:

- sample generated URIs
- selected sample triples
- indication of source provenance
- warnings when preview differs from final export assumptions

### Exit criteria

- User can pass validation and export a schema-only graph
- User can pass validation and export a full graph for at least file-based structured sources
- Export handles large datasets lazily without loading all rows into memory

---

## Phase 10: Stage 6 Unstructured Enrichment

### Goal

Add the most complex pipeline stage after the deterministic structured-data workflow is stable.

### Deliverables

- Unstructured source processing pipeline
- Text extraction for Markdown, PDF, and URL sources
- Per-document ontology extraction
- Merged enrichment ontology
- Reconciliation against canonical graph
- Proposal routing for:
  - annotate
  - new edge
  - new type
- Loop-back handling into Stages 4 and 5

### Implementation order

1. Markdown ingestion and extraction
2. URL extraction
3. PDF extraction
4. Small-document direct extraction flow
5. Chunked large-document flow
6. Merged ontology pass
7. Reconciliation into canonical graph
8. Evidence-first proposal review UX

### Constraints

- Every extraction output must carry evidence quotes or source spans
- Every LLM result must be schema-validated structured output
- Cost estimation should be surfaced before expensive runs
- Extraction results must be cached by source fingerprint and prompt/model settings

### Exit criteria

- User can enrich a project from at least Markdown documents
- Enrichment proposals carry evidence and provenance
- New-type proposals loop back cleanly into consolidation

---

## Phase 11: Embeddings and LLM Intelligence Layers

### Goal

Add optional intelligence features without making the product dependent on them for baseline usefulness.

### Deliverables

- Global and per-project LLM configuration
- OpenRouter integration
- Structured-output wrappers for all LLM tasks
- Embedding support with local/cloud mode
- Result caching
- Budget awareness in UI

### Feature areas to enable

- Stage 3 ambiguous relationship proposals
- Stage 4 ontology alignment suggestions
- Stage 5 fuzzy record linkage assists
- Stage 6 enrichment extraction and merge passes

### Engineering requirements

- Strict JSON/schema validation of outputs
- Retry/failure policy for transient model issues
- Clear “AI-generated” provenance in UI
- Configurable model routing by task type
- Caching keyed by:
  - source fingerprint
  - prompt hash
  - model identifier
  - relevant settings

### Exit criteria

- AI features are optional and degradable
- Cached reruns avoid unnecessary spend
- Failures do not corrupt project state or block deterministic workflows

---

## 6. Cross-Cutting Workstreams

## 6.1 Frontend architecture

The Tauri frontend should not recreate the Electron prototype’s context sprawl unchanged. The rewrite should organize state by durable concerns:

- project/session state
- source catalog state
- schema graph state
- proposals state
- jobs state
- preview/export state
- settings state

Recommended approach:

- Use feature-oriented modules
- Keep server truth in Rust/SQLite, not duplicated in large in-memory frontend stores
- Use frontend state primarily for:
  - view state
  - optimistic interaction state
  - cached query results

The first major frontend milestone should be a multi-pane shell:

- left: sources / stages
- center: main workspace
- right: proposals / preview / details
- bottom or overlay: jobs/progress

## 6.2 Provenance model

Provenance is not optional metadata. It should be built into:

- proposals
- accepted relationships
- consolidation decisions
- conflict policies
- enrichment outputs
- exports using named graphs where required

Every major workflow should answer:

- where did this come from?
- why was it suggested?
- what evidence supports it?
- what user/system action changed it?

## 6.3 Undo/redo and non-destructive editing

Undo/redo should be implemented as a first-class product capability, not a polish item. Every mutating action must define:

- forward operation
- persisted change-log payload
- reversal behavior

Recommended rule:

No new mutation command should be merged without an explicit decision on whether and how it is undoable.

## 6.4 Testing strategy

Testing should be introduced alongside each phase, not deferred.

Backend tests:

- SQLite schema/migration tests
- adapter tests against fixture data
- profiling query tests
- proposal-engine unit tests
- export golden tests
- change-log undo/redo tests

Frontend tests:

- component tests for major workflows
- state integration tests around IPC-driven views
- visual regression snapshots for core panels if tooling budget allows

End-to-end tests:

- create project
- add source
- run profiling
- accept proposal
- consolidate entity types
- configure URI strategy
- export schema-only

Fixture strategy:

- Reuse and extend `apps/electron/test_workspace`
- Add dedicated fixtures for:
  - dirty duplicates
  - soft FK detection
  - conflicting attributes
  - enrichment documents

## 6.5 Documentation strategy

As the rewrite proceeds, `apps/docs` should gain a second architecture track for EntitySmith so docs do not remain Electron-specific.

Recommended docs milestones:

- Tauri architecture overview
- project file schema
- adapter model
- proposal lifecycle
- consolidation model
- export model
- enrichment design

## 6.6 Performance and scale

Performance-sensitive principles to enforce from the start:

- Never load entire large datasets into frontend memory
- Paginate or sample previews
- Stream export
- Cache expensive profiling and LLM/enrichment outputs
- Avoid frontend source-of-truth duplication of large backend data structures

## 6.7 Security and privacy

Key requirements:

- API keys stored securely and excluded from project files unless explicitly intended
- Remote-model use clearly disclosed in the UI
- Local-only mode remains possible for structured workflows
- Source credentials for remote databases handled carefully and, if supported, stored using platform-secure facilities where possible

---

## 7. Suggested Repository Changes

These are the likely high-level codebase changes implied by the plan.

### `apps/EntitySmith`

- Becomes the primary product implementation
- Receives the full React frontend and Rust backend architecture

### `apps/electron`

- Remains as:
  - a reference implementation while the rewrite is in progress
  - a source of reusable UI patterns and test fixtures
- Should not receive major new feature work unless required to unblock migration understanding

### `apps/docs`

- Should document the Tauri architecture as the source of truth for the new app
- Existing Electron docs can remain for historical/prototype context, but should be labeled clearly

### Optional new packages

Possible additions if complexity grows:

- `packages/domain-docs` or similar is unnecessary at first
- A shared TypeScript package for frontend-only schema types could be useful later
- Avoid introducing shared packages prematurely if they only move files around without reducing duplication

---

## 8. Milestone-Based Delivery Plan

## Milestone A: Usable persisted shell

Includes:

- Phase 0
- Phase 1
- basic Phase 2

User outcome:

- Can create/open a project and register sources

## Milestone B: Structured-source discovery

Includes:

- Phase 3
- Phase 4

User outcome:

- Can profile structured sources and inspect discovered entities/attributes

## Milestone C: Canonical schema authoring

Includes:

- Phase 5
- deterministic portions of Phase 6
- core portions of Phase 7

User outcome:

- Can build and refine a schema graph with persisted proposals and consolidation decisions

## Milestone D: Exportable graph

Includes:

- Phase 8
- Phase 9

User outcome:

- Can produce schema-only and full exports from structured sources

## Milestone E: Intelligence-enhanced workflow

Includes:

- Phase 10
- Phase 11

User outcome:

- Can enrich from unstructured data and use embedding/LLM assists where valuable

---

## 9. High-Risk Areas and Mitigations

## 9.1 Risk: data model churn between stages

Mitigation:

- Finalize core domain boundaries early
- Keep source entities distinct from canonical entity types
- Add migration coverage immediately

## 9.2 Risk: overloading the frontend with backend concerns

Mitigation:

- Treat Rust + SQLite as the source of truth
- Keep React focused on presentation and interaction
- Push expensive and durable logic behind IPC

## 9.3 Risk: proposal noise destroys trust

Mitigation:

- Start with high-precision deterministic methods
- Surface provenance and evidence clearly
- Require review before destructive downstream effects

## 9.4 Risk: Stage 6 complexity stalls the whole rewrite

Mitigation:

- Keep unstructured enrichment out of the critical path
- Deliver a strong structured-data product first
- Add enrichment only after exportable graph workflows are stable

## 9.5 Risk: LLM integration leaks cost and nondeterminism into core flows

Mitigation:

- Make AI layers optional
- Cache aggressively
- Enforce structured outputs
- Keep deterministic fallbacks for every important workflow

## 9.6 Risk: export pipeline becomes memory-bound on large inputs

Mitigation:

- Stream from sources lazily
- Use DuckDB and row-wise processing where appropriate
- Validate the approach early with large fixture data

---

## 10. Recommended Immediate Next Steps

If implementation begins now, the first concrete engineering sequence should be:

1. Replace the Tauri template app with a real shell and project open/create flow.
2. Implement the SQLite-backed project store and migrations in Rust.
3. Define the first stable Rust domain model and IPC surface.
4. Build source registration for SQLite and JSON.
5. Add profiling jobs and persisted source profiles.
6. Port the ReactFlow canvas as a persisted schema-graph editor.
7. Implement deterministic Stage 3 relationship proposals.
8. Implement Stage 4 consolidation and mapping.
9. Add validation and Turtle schema-only export.
10. Add Stage 5 identity resolution and full export.
11. Add embeddings, LLM proposal layers, and Stage 6 enrichment afterward.

This ordering keeps the project aligned with `BRAINSTORM.md` while minimizing architectural rework.

---

## 11. Definition of Done for the Rewrite

The rewrite should be considered substantively complete when all of the following are true:

- A user can complete Stages 1-8 in `apps/EntitySmith`
- Project state is persisted in a portable `.entitysmith` file
- Structured workflows work without any AI dependency
- Provenance is visible across proposals and decisions
- Undo/redo is persisted and reliable
- Validation gates block broken exports
- Full export streams lazily from sources
- Unstructured enrichment is integrated with reviewable evidence
- Docs describe the Tauri architecture rather than only the Electron prototype

Until then, the Electron app should be treated as a prototype/reference, not the long-term product surface.
