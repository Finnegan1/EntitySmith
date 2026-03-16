import { useEffect } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ProfilePanel, ProfileLoading } from "@/features/sources/ProfilePanel";
import { useSourceProfile } from "@/hooks/useSourceProfile";
import type { AppView, Proposal, SourceDescriptor, SourceKind } from "@/types";

interface DetailsPanelProps {
  activeView: AppView;
  selectedSource: SourceDescriptor | null;
  selectedProposal: Proposal | null;
  onClose: () => void;
}

export function DetailsPanel({
  activeView,
  selectedSource,
  selectedProposal,
  onClose,
}: DetailsPanelProps) {
  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-l border-border bg-sidebar">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <p className="text-xs font-semibold text-sidebar-foreground">
          {PANEL_TITLE[activeView]}
        </p>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {activeView === "sources" && selectedSource ? (
          <SourceDetail source={selectedSource} />
        ) : activeView === "proposals" && selectedProposal ? (
          <ProposalDetail proposal={selectedProposal} />
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

  // Load existing profile whenever the selected source changes.
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

      {/* Path */}
      {source.path && (
        <DetailRow label="Path">
          <p className="break-all text-[11px] text-muted-foreground font-mono">
            {source.path}
          </p>
        </DetailRow>
      )}

      {/* Timestamps */}
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
            <span className="text-xs text-muted-foreground">{label}</span>
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
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Profile
        </p>
        {canProfile && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2"
            onClick={handleProfile}
            disabled={isLoading}
          >
            {isLoading ? "Running…" : profile ? "Re-profile" : "Profile"}
          </Button>
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

const PROPOSAL_KIND_LABEL: Record<Proposal["kind"], string> = {
  foreign_key: "Declared FK",
  soft_foreign_key: "Soft FK",
  column_name_similarity: "Name similarity",
  sample_value_overlap: "Value overlap",
  embedding_similarity: "Embedding",
  llm_reasoning: "LLM reasoning",
};

const STATUS_COLOR: Record<Proposal["status"], string> = {
  pending: "text-muted-foreground",
  accepted: "text-green-600",
  modified: "text-blue-500",
  rejected: "text-muted-foreground/50",
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
        <p className={`text-xs font-medium capitalize ${STATUS_COLOR[p.status]}`}>
          {p.status}
        </p>
      </DetailRow>

      <DetailRow label="Confidence">
        <p className="text-xs text-foreground">{confidencePct}%</p>
      </DetailRow>

      <DetailRow label="Kind">
        <p className="text-xs text-foreground">{PROPOSAL_KIND_LABEL[p.kind]}</p>
      </DetailRow>

      <DetailRow label="Cardinality">
        <p className="text-xs text-foreground font-mono">
          {effectiveCardinality === "unknown" ? "—" : effectiveCardinality}
        </p>
      </DetailRow>

      <Separator className="my-3" />

      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Evidence
      </p>
      <div className="flex flex-col gap-1.5">
        {Object.entries(p.evidence).map(([key, val]) => (
          <div key={key} className="flex items-start justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{key}</span>
            <span className="text-right font-mono text-[11px] text-foreground">
              {typeof val === "number"
                ? val < 1
                  ? `${(val * 100).toFixed(1)}%`
                  : val.toFixed(2)
                : typeof val === "boolean"
                  ? val ? "yes" : "no"
                  : Array.isArray(val)
                    ? JSON.stringify(val)
                    : String(val)}
            </span>
          </div>
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

const CAPABILITIES: Record<SourceKind, { label: string; enabled: boolean }[]> =
  {
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
