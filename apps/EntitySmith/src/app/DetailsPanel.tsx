import { useEffect } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProfilePanel, ProfileLoading } from "@/features/sources/ProfilePanel";
import { useSourceProfile } from "@/hooks/useSourceProfile";
import type { AppView, EntityTypeWithBindings, Proposal, ProposalReason, SourceDescriptor, SourceKind } from "@/types";

// ── Tooltip helper ─────────────────────────────────────────────────────────────

function Tip({
  children,
  content,
  side = "left",
}: {
  children: React.ReactNode;
  content: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <p className="max-w-[260px]">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Panel shell ───────────────────────────────────────────────────────────────

interface DetailsPanelProps {
  activeView: AppView;
  selectedSource: SourceDescriptor | null;
  selectedProposal: Proposal | null;
  selectedEntityType?: EntityTypeWithBindings | null;
  onClose: () => void;
}

export function DetailsPanel({
  activeView,
  selectedSource,
  selectedProposal,
  selectedEntityType,
  onClose,
}: DetailsPanelProps) {
  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-l border-border bg-sidebar">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <p className="text-xs font-semibold text-sidebar-foreground">
          {PANEL_TITLE[activeView]}
        </p>
        <Tip content="Close the details panel." side="left">
          <button
            onClick={onClose}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X size={14} />
          </button>
        </Tip>
      </div>

      <div className="flex-1 overflow-auto">
        {activeView === "sources" && selectedSource ? (
          <SourceDetail source={selectedSource} />
        ) : activeView === "proposals" && selectedProposal ? (
          <ProposalDetail proposal={selectedProposal} />
        ) : activeView === "schema-graph" && selectedEntityType ? (
          <EntityTypeDetail et={selectedEntityType} />
        ) : (
          <EmptyDetail message={PANEL_EMPTY[activeView]} />
        )}
      </div>
    </aside>
  );
}

// ── Source detail ─────────────────────────────────────────────────────────────

function SourceDetail({ source }: { source: SourceDescriptor }) {
  const caps = CAPABILITIES[source.kind];
  const canProfile = caps.find((c) => c.label === "Profile")?.enabled ?? false;

  const { profile, isLoading, error, profileSource, loadProfile, clearError } =
    useSourceProfile(source.id);

  useEffect(() => {
    loadProfile(source.id);
  }, [source.id, loadProfile]);

  async function handleProfile() {
    clearError();
    await profileSource(source.id);
    await loadProfile(source.id);
  }

  return (
    <div className="flex flex-col gap-0 p-4">
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 text-xl">{KIND_ICON[source.kind]}</span>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-foreground break-words">
            {source.name}
          </p>
          <Badge variant="outline" className="mt-1 text-[10px]">
            {KIND_LABEL[source.kind]}
          </Badge>
        </div>
      </div>

      <Separator className="mb-3" />

      {source.path && (
        <DetailRow label="Path">
          <p className="break-all text-[11px] text-muted-foreground font-mono">
            {source.path}
          </p>
        </DetailRow>
      )}

      <DetailRow label="Added">
        <p className="text-[11px] text-muted-foreground">
          {formatDate(source.createdAt)}
        </p>
      </DetailRow>

      <Separator className="my-3" />

      {/* Capabilities */}
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Capabilities
      </p>
      <div className="flex flex-col gap-1.5">
        {caps.map(({ label, enabled }) => (
          <div key={label} className="flex items-center justify-between">
            <Tip content={CAPABILITY_TIP[label]} side="left">
              <span className="text-xs text-muted-foreground cursor-help">{label}</span>
            </Tip>
            <span
              className={`text-[11px] font-medium ${
                enabled ? "text-green-600" : "text-muted-foreground/50"
              }`}
            >
              {enabled ? "Yes" : "—"}
            </span>
          </div>
        ))}
      </div>

      <Separator className="my-3" />

      {/* Profile section */}
      <div className="flex items-center justify-between mb-2">
        <Tip
          content="Profiling analyses this source's structure: column types, row counts, null rates, unique value estimates, and foreign key candidates. Results are stored and used to generate connection proposals."
          side="left"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-help">
            Profile
          </p>
        </Tip>
        {canProfile && (
          <Tip
            content={
              profile
                ? "Re-run profiling to pick up schema changes or new rows. Clears and replaces the previous profile."
                : "Analyse this source's structure and store the results. Profiling is required before connection proposals can be generated."
            }
            side="left"
          >
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2"
              onClick={handleProfile}
              disabled={isLoading}
            >
              {isLoading ? "Running…" : profile ? "Re-profile" : "Profile"}
            </Button>
          </Tip>
        )}
      </div>

      {error && (
        <p className="mb-2 text-[11px] text-destructive">{error}</p>
      )}

      {isLoading ? (
        <ProfileLoading />
      ) : profile ? (
        <ProfilePanel profile={profile} />
      ) : canProfile ? (
        <p className="text-xs text-muted-foreground">
          Click Profile to analyse this source.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          This source kind does not support profiling.
        </p>
      )}
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

// ── Proposal detail ───────────────────────────────────────────────────────────

const REASON_KIND_LABEL: Record<ProposalReason["kind"], string> = {
  foreign_key: "Declared FK",
  soft_foreign_key: "Soft FK",
  column_name_similarity: "Name similarity",
  sample_value_overlap: "Value overlap",
  embedding_similarity: "Embedding",
  llm_reasoning: "LLM reasoning",
};

const REASON_KIND_TIP: Record<ProposalReason["kind"], string> = {
  foreign_key:
    "A foreign key constraint explicitly declared in the source schema (e.g. REFERENCES in SQLite). Near-certain relationship — confidence 0.95.",
  soft_foreign_key:
    "A likely FK detected from column naming patterns: a column named '{entity}_id' alongside a table called '{entity}'. Not declared in the schema but structurally matched — confidence 0.70.",
  column_name_similarity:
    "Relationship suggested by column-name similarity across two sources: exact match (+0.40), normalized match (+0.30), or Jaro-Winkler string distance above 0.85.",
  sample_value_overlap:
    "Relationship suggested because two columns across sources share a large fraction of their sample values — strong evidence one column references the other.",
  embedding_similarity:
    "Relationship suggested by semantic similarity of column names and sample values, computed using a text embedding model.",
  llm_reasoning:
    "Relationship suggested by an LLM that analysed both tables in context and reasoned about whether a connection exists.",
};

const STATUS_TIP: Record<Proposal["status"], string> = {
  pending: "Not yet reviewed. Accepting this proposal will create entity types and a relationship in the schema graph.",
  accepted: "Accepted — entity types and the relationship have been created in the schema graph.",
  modified: "Accepted with a custom predicate or cardinality you edited. The modified values were used when promoting to the schema graph.",
  rejected: "Dismissed — this proposal is excluded from the graph. Re-running analysis will not reintroduce it.",
};

const STATUS_COLOR: Record<Proposal["status"], string> = {
  pending: "text-muted-foreground",
  accepted: "text-green-600",
  modified: "text-blue-500",
  rejected: "text-muted-foreground/50",
};

const EVIDENCE_KEY_TIP: Record<string, string> = {
  is_declared:
    "Whether this FK was declared in the source schema. Declared FKs are near-certain; inferred ones are detected from naming patterns.",
  link_columns:
    "The column pair that links the two entities (from_column → to_column).",
  to_pk:
    "The primary key column on the target entity that the FK column references.",
  pattern:
    "The naming pattern that triggered this soft FK detection (e.g. 'user_id' matches the 'user' prefix).",
  method:
    "The detection method used to identify this as a FK candidate.",
  jaro_winkler:
    "Jaro-Winkler string similarity between the two column names (0–1). Scores above 0.85 contribute to the confidence. Handles typos and abbreviations better than exact matching.",
  name_score:
    "Score for column name matching: +0.40 for exact match, +0.30 for normalized match (same after stripping case and separators like underscores).",
  fk_pattern_score:
    "Score for the FK naming pattern: a column named '{entity}_id' pointing at a table called '{entity}'. Contributes +0.80 when detected.",
  value_overlap:
    "Fraction of sample values shared between the two columns. High overlap is strong evidence that one column references the other.",
  total_score:
    "Sum of all sub-scores (name match + FK pattern + Jaro-Winkler + value overlap + PK type match). Proposals are generated when total_score ≥ 0.40.",
};

function ProposalDetail({ proposal: p }: { proposal: Proposal }) {
  const effectivePredicate = p.reviewedPredicate ?? p.suggestedPredicate;
  const effectiveCardinality = p.reviewedCardinality ?? p.suggestedCardinality;
  const confidencePct = Math.round(p.confidence * 100);

  return (
    <div className="flex flex-col gap-0 p-4">
      {/* Connection summary */}
      <div className="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Connection
        </p>
        <div className="space-y-0.5 font-mono text-[11px]">
          <p className="text-foreground">
            <span className="text-muted-foreground">{p.fromEntity}</span>
            <span className="text-muted-foreground/50">.</span>
            {p.fromColumn}
          </p>
          <p className="pl-2 text-primary">→ {effectivePredicate}</p>
          <p className="text-foreground">
            <span className="text-muted-foreground">{p.toEntity}</span>
            <span className="text-muted-foreground/50">.</span>
            {p.toColumn}
          </p>
        </div>
      </div>

      <Separator className="mb-3" />

      <DetailRow label="Status">
        <Tip content={STATUS_TIP[p.status]} side="left">
          <p className={`text-xs font-medium capitalize cursor-help ${STATUS_COLOR[p.status]}`}>
            {p.status}
          </p>
        </Tip>
      </DetailRow>

      <DetailRow label="Confidence">
        <Tip
          content={`Combined confidence across all detection reasons: ${confidencePct}%. Formula: 1 − Π(1 − cᵢ) — multiple independent signals multiply the certainty. Always verify before accepting.`}
          side="left"
        >
          <p className="text-xs text-foreground cursor-help">{confidencePct}%</p>
        </Tip>
      </DetailRow>

      <DetailRow label="Cardinality">
        <Tip
          content="Expected multiplicity of this relationship. 1:N means one source entity relates to many target entities; N:N means many-to-many. 'Unknown' means the engine couldn't determine it from sample data."
          side="left"
        >
          <p className="text-xs text-foreground font-mono cursor-help">
            {effectiveCardinality === "unknown" ? "—" : effectiveCardinality}
          </p>
        </Tip>
      </DetailRow>

      <Separator className="my-3" />

      {/* Detection reasons */}
      <Tip
        content="Each reason represents one detection method that independently found evidence for this connection. Multiple reasons increase the combined confidence via independent-evidence combination."
        side="left"
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-help">
          Detection Reasons ({p.reasons.length})
        </p>
      </Tip>

      <div className="flex flex-col gap-3">
        {p.reasons.map((reason, i) => (
          <ReasonDetail key={i} reason={reason} />
        ))}
      </div>

      {(p.reviewedPredicate || p.reviewedCardinality) && (
        <>
          <Separator className="my-3" />
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            User modifications
          </p>
          {p.reviewedPredicate && (
            <DetailRow label="Predicate">
              <p className="font-mono text-xs text-foreground">{p.reviewedPredicate}</p>
            </DetailRow>
          )}
          {p.reviewedCardinality && (
            <DetailRow label="Cardinality">
              <p className="font-mono text-xs text-foreground">{p.reviewedCardinality}</p>
            </DetailRow>
          )}
        </>
      )}
    </div>
  );
}

function ReasonDetail({ reason }: { reason: ProposalReason }) {
  const confidencePct = Math.round(reason.confidence * 100);

  return (
    <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2">
      {/* Reason header */}
      <div className="mb-1.5 flex items-center justify-between">
        <Tip content={REASON_KIND_TIP[reason.kind]} side="left">
          <span className="text-[11px] font-semibold text-foreground cursor-help">
            {REASON_KIND_LABEL[reason.kind]}
          </span>
        </Tip>
        <Tip
          content={`Confidence contributed by this detection method: ${confidencePct}%.`}
          side="left"
        >
          <span className={`text-[10px] font-semibold tabular-nums cursor-help ${
            confidencePct >= 85
              ? "text-green-600"
              : confidencePct >= 60
                ? "text-yellow-600"
                : "text-muted-foreground"
          }`}>
            {confidencePct}%
          </span>
        </Tip>
      </div>

      {/* Evidence entries */}
      <div className="flex flex-col gap-1">
        {Object.entries(reason.evidence).map(([key, val]) => {
          const tip = EVIDENCE_KEY_TIP[key];
          const formatted =
            typeof val === "number"
              ? val < 1
                ? `${(val * 100).toFixed(1)}%`
                : val.toFixed(2)
              : typeof val === "boolean"
                ? val ? "yes" : "no"
                : Array.isArray(val)
                  ? JSON.stringify(val)
                  : String(val);

          return (
            <div key={key} className="flex items-start justify-between gap-2">
              {tip ? (
                <Tip content={tip} side="left">
                  <span className="text-[10px] text-muted-foreground cursor-help underline decoration-dotted underline-offset-2">
                    {key}
                  </span>
                </Tip>
              ) : (
                <span className="text-[10px] text-muted-foreground">{key}</span>
              )}
              <span className="text-right font-mono text-[10px] text-foreground">
                {formatted}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Entity type detail ────────────────────────────────────────────────────────

function EntityTypeDetail({ et }: { et: EntityTypeWithBindings }) {
  return (
    <div className="flex flex-col gap-0 p-4">
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 text-xl">🔷</span>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-foreground break-words">
            {et.entityType.name}
          </p>
          {et.entityType.label && (
            <p className="text-xs text-muted-foreground mt-0.5">{et.entityType.label}</p>
          )}
        </div>
      </div>
      <Separator className="mb-3" />
      <DetailRow label="Added">
        <p className="text-[11px] text-muted-foreground">{formatDate(et.entityType.createdAt)}</p>
      </DetailRow>
      {et.entityType.description && (
        <DetailRow label="Description">
          <p className="text-xs text-foreground">{et.entityType.description}</p>
        </DetailRow>
      )}
      <Separator className="my-3" />
      <Tip
        content="Source entities from your registered sources that are mapped to this canonical type. During export, records from all bound sources are merged under this type's RDF class. Add more bindings from the Catalog tab in the Schema Graph view."
        side="left"
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-help">
          Source Bindings ({et.bindings.length})
        </p>
      </Tip>
      {et.bindings.length === 0 ? (
        <p className="text-xs text-muted-foreground">No source entities bound yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {et.bindings.map((b) => (
            <div key={b.id} className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground truncate">{b.entityName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyDetail({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const KIND_ICON: Record<SourceKind, string> = {
  sqlite_file: "🗄️",
  json_file: "{ }",
  csv_file: "📊",
  markdown_folder: "📝",
  pdf_file: "📄",
  url: "🔗",
  postgres: "🐘",
  mysql: "🐬",
};

const KIND_LABEL: Record<SourceKind, string> = {
  sqlite_file: "SQLite",
  json_file: "JSON",
  csv_file: "CSV",
  markdown_folder: "Markdown",
  pdf_file: "PDF",
  url: "URL",
  postgres: "Postgres",
  mysql: "MySQL",
};

const CAPABILITY_TIP: Record<string, string> = {
  Profile:
    "Analyse this source's structure: column types, row counts, null rates, approximate unique value counts, and foreign key candidates. Results feed directly into connection proposal generation.",
  "Sample rows":
    "Load a small preview of actual records for inspection in the UI. Samples are used during cross-source matching to detect value overlap.",
  "Schema introspection":
    "Read declared table and column metadata directly from the source (e.g. PRAGMA table_info for SQLite). More accurate than type inference alone — provides declared PKs and FKs.",
  "Lazy export":
    "Stream records from this source row by row during export, without loading the full dataset into memory. Essential for large sources that don't fit in RAM.",
  Enrichment:
    "Extract entity types, relationships, and evidence from unstructured text using LLM-based analysis. Available for Markdown, PDF, and URL sources. Results appear as proposals in the Proposals view.",
};

const CAPABILITIES: Record<SourceKind, { label: string; enabled: boolean }[]> = {
  sqlite_file: [
    { label: "Profile", enabled: true },
    { label: "Sample rows", enabled: true },
    { label: "Schema introspection", enabled: true },
    { label: "Lazy export", enabled: true },
    { label: "Enrichment", enabled: false },
  ],
  json_file: [
    { label: "Profile", enabled: true },
    { label: "Sample rows", enabled: true },
    { label: "Schema introspection", enabled: false },
    { label: "Lazy export", enabled: false },
    { label: "Enrichment", enabled: false },
  ],
  csv_file: [
    { label: "Profile", enabled: true },
    { label: "Sample rows", enabled: true },
    { label: "Schema introspection", enabled: false },
    { label: "Lazy export", enabled: true },
    { label: "Enrichment", enabled: false },
  ],
  markdown_folder: [
    { label: "Profile", enabled: false },
    { label: "Sample rows", enabled: false },
    { label: "Schema introspection", enabled: false },
    { label: "Lazy export", enabled: false },
    { label: "Enrichment", enabled: true },
  ],
  pdf_file: [
    { label: "Profile", enabled: false },
    { label: "Sample rows", enabled: false },
    { label: "Schema introspection", enabled: false },
    { label: "Lazy export", enabled: false },
    { label: "Enrichment", enabled: true },
  ],
  url: [
    { label: "Profile", enabled: false },
    { label: "Sample rows", enabled: false },
    { label: "Schema introspection", enabled: false },
    { label: "Lazy export", enabled: false },
    { label: "Enrichment", enabled: true },
  ],
  postgres: [
    { label: "Profile", enabled: true },
    { label: "Sample rows", enabled: true },
    { label: "Schema introspection", enabled: true },
    { label: "Lazy export", enabled: true },
    { label: "Enrichment", enabled: false },
  ],
  mysql: [
    { label: "Profile", enabled: true },
    { label: "Sample rows", enabled: true },
    { label: "Schema introspection", enabled: true },
    { label: "Lazy export", enabled: true },
    { label: "Enrichment", enabled: false },
  ],
};

const PANEL_TITLE: Record<AppView, string> = {
  project: "Project Details",
  sources: "Source Details",
  "schema-graph": "Node Details",
  proposals: "Proposal Details",
  identity: "Linkage Details",
  export: "Export Preview",
  settings: "Info",
};

const PANEL_EMPTY: Record<AppView, string> = {
  project: "Select a project to view details.",
  sources: "Select a source to inspect its details and capabilities.",
  "schema-graph": "Select a node or edge to view details.",
  proposals: "Select a proposal to view evidence and provenance.",
  identity: "Select an entity type to configure identity resolution.",
  export: "Configure export settings to preview the output.",
  settings: "",
};
