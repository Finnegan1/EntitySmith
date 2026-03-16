import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProposals } from "@/hooks/useProposals";
import type { Proposal, ProposalStatus } from "@/types";

type StatusTab = "all" | ProposalStatus;
type OriginFilter = "all" | "declared_fk" | "heuristic";

interface ProposalsViewProps {
  projectId: string;
  selectedProposalId: string | null;
  onProposalSelect: (proposal: Proposal | null) => void;
}

export function ProposalsView({
  projectId: _projectId,
  selectedProposalId,
  onProposalSelect,
}: ProposalsViewProps) {
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");

  const {
    proposals,
    isLoading,
    isGenerating,
    error,
    pendingCount,
    generateProposals,
    reviewProposal,
    clearError,
  } = useProposals();

  // Client-side filtering on top of the full list
  const filtered = proposals.filter((p) => {
    const statusOk = statusTab === "all" || p.status === statusTab;
    const originOk = originFilter === "all" || p.origin === originFilter;
    return statusOk && originOk;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusTab(tab.value)}
              className={cn(
                "rounded px-2.5 py-1 text-xs transition-colors",
                statusTab === tab.value
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.value === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
          <div className="mx-1 h-4 w-px bg-border" />
          {ORIGIN_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setOriginFilter(f.value)}
              className={cn(
                "rounded px-2 py-1 text-[11px] transition-colors",
                originFilter === f.value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          onClick={generateProposals}
          disabled={isGenerating || isLoading}
        >
          {isGenerating ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          {isGenerating ? "Running…" : "Run Analysis"}
        </Button>
      </div>

      {/* Error bar */}
      {error && (
        <div className="flex shrink-0 items-center justify-between border-b border-destructive/30 bg-destructive/10 px-4 py-2">
          <p className="text-xs text-destructive">{error}</p>
          <button
            onClick={clearError}
            className="text-destructive hover:text-destructive/80"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState statusTab={statusTab} />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((p) => (
              <ProposalRow
                key={p.id}
                proposal={p}
                isSelected={p.id === selectedProposalId}
                onSelect={onProposalSelect}
                onReview={reviewProposal}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── ProposalRow ───────────────────────────────────────────────────────────────

function ProposalRow({
  proposal: p,
  isSelected,
  onSelect,
  onReview,
}: {
  proposal: Proposal;
  isSelected: boolean;
  onSelect: (proposal: Proposal | null) => void;
  onReview: (
    id: string,
    action: "accept" | "reject" | "modify",
    predicate?: string,
    cardinality?: string,
  ) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editPredicate, setEditPredicate] = useState(
    p.reviewedPredicate ?? p.suggestedPredicate,
  );
  const [editCardinality, setEditCardinality] = useState(
    p.reviewedCardinality ?? p.suggestedCardinality,
  );

  const isPending = p.status === "pending";
  const effectivePredicate = p.reviewedPredicate ?? p.suggestedPredicate;

  async function handle(action: "accept" | "reject" | "modify") {
    setBusy(true);
    try {
      await onReview(
        p.id,
        action,
        action === "modify" ? editPredicate : undefined,
        action === "modify" ? editCardinality : undefined,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="group">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(isSelected ? null : p)}
        onKeyDown={(e) => e.key === "Enter" && onSelect(isSelected ? null : p)}
        className={cn(
          "flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors",
          isSelected
            ? "bg-accent/60"
            : isPending
              ? "hover:bg-muted/40"
              : "opacity-70 hover:bg-muted/20",
        )}
      >
        {/* Status icon */}
        <div className="mt-0.5 shrink-0">
          <StatusIcon status={p.status} />
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Connection line */}
          <div className="flex flex-wrap items-center gap-1.5">
            <EntityChip entity={p.fromEntity} column={p.fromColumn} />
            <ArrowRight size={12} className="shrink-0 text-muted-foreground" />
            <span className="font-mono text-[11px] text-primary">
              {effectivePredicate}
            </span>
            <ArrowRight size={12} className="shrink-0 text-muted-foreground" />
            <EntityChip entity={p.toEntity} column={p.toColumn} />
          </div>

          {/* Meta row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ConfidenceBadge confidence={p.confidence} />
            <KindBadge kind={p.kind} />
            <span className="text-[10px] text-muted-foreground">
              {p.suggestedCardinality !== "unknown" && p.suggestedCardinality}
            </span>
          </div>
        </div>

        {/* Actions — stop clicks here from deselecting the row */}
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {isPending && !expanded && (
            <>
              <ActionButton
                label="Accept"
                variant="accept"
                busy={busy}
                onClick={() => handle("accept")}
              />
              <ActionButton
                label="Reject"
                variant="reject"
                busy={busy}
                onClick={() => handle("reject")}
              />
            </>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
            <EvidenceSection evidence={p.evidence} kind={p.kind} />
          </div>

          {isPending && (
            <div className="mt-3 flex items-end gap-2 border-t border-border/50 pt-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">
                  Predicate
                </label>
                <input
                  type="text"
                  value={editPredicate}
                  onChange={(e) => setEditPredicate(e.target.value)}
                  className="h-7 rounded border border-border bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground">
                  Cardinality
                </label>
                <select
                  value={editCardinality}
                  onChange={(e) => setEditCardinality(e.target.value)}
                  className="h-7 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="unknown">Unknown</option>
                  <option value="one_to_one">1 : 1</option>
                  <option value="one_to_many">1 : N</option>
                  <option value="many_to_many">N : N</option>
                </select>
              </div>
              <div className="flex gap-1.5">
                <ActionButton
                  label="Save & Accept"
                  variant="accept"
                  busy={busy}
                  onClick={() => handle("modify")}
                />
                <ActionButton
                  label="Reject"
                  variant="reject"
                  busy={busy}
                  onClick={() => handle("reject")}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ── Evidence section ──────────────────────────────────────────────────────────

function EvidenceSection({
  evidence,
  kind,
}: {
  evidence: Record<string, unknown>;
  kind: Proposal["kind"];
}) {
  if (kind === "foreign_key" || kind === "soft_foreign_key") {
    const linkCols = evidence.link_columns as
      | { from: string; to: string }[]
      | undefined;
    return (
      <>
        <EvidenceRow
          label="Type"
          value={kind === "foreign_key" ? "Declared foreign key" : "Name pattern"}
        />
        {linkCols && (
          <EvidenceRow
            label="Link"
            value={linkCols.map((c) => `${c.from} → ${c.to}`).join(", ")}
          />
        )}
        {evidence.to_pk && (
          <EvidenceRow label="Target PK" value={String(evidence.to_pk)} />
        )}
      </>
    );
  }

  if (kind === "column_name_similarity") {
    return (
      <>
        <EvidenceRow
          label="Jaro-Winkler"
          value={pct(evidence.jaro_winkler as number | undefined)}
        />
        <EvidenceRow
          label="Name score"
          value={fmt(evidence.name_score as number | undefined)}
        />
        <EvidenceRow
          label="FK pattern score"
          value={fmt(evidence.fk_pattern_score as number | undefined)}
        />
        <EvidenceRow
          label="Value overlap"
          value={pct(evidence.value_overlap as number | undefined)}
        />
      </>
    );
  }

  if (kind === "sample_value_overlap") {
    return (
      <>
        <EvidenceRow
          label="Value overlap"
          value={pct(evidence.value_overlap as number | undefined)}
        />
        <EvidenceRow
          label="Name score"
          value={fmt(evidence.name_score as number | undefined)}
        />
      </>
    );
  }

  return <EvidenceRow label="Evidence" value={JSON.stringify(evidence)} />;
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </>
  );
}

function pct(v: number | undefined) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmt(v: number | undefined) {
  if (v == null) return "—";
  return v.toFixed(2);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EntityChip({
  entity,
  column,
}: {
  entity: string;
  column: string;
}) {
  return (
    <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
      <span className="text-foreground">{entity}</span>
      <span className="text-muted-foreground">.</span>
      <span className="text-muted-foreground">{column}</span>
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 85
      ? "text-green-600"
      : pct >= 60
        ? "text-yellow-600"
        : "text-muted-foreground";
  return (
    <span className={cn("text-[10px] font-semibold tabular-nums", color)}>
      {pct}%
    </span>
  );
}

function KindBadge({ kind }: { kind: Proposal["kind"] }) {
  return (
    <Badge variant="outline" className="h-4 px-1 text-[10px]">
      {KIND_LABEL[kind]}
    </Badge>
  );
}

function StatusIcon({ status }: { status: ProposalStatus }) {
  switch (status) {
    case "pending":
      return <div className="h-2 w-2 rounded-full bg-muted-foreground/40 mt-1" />;
    case "accepted":
      return <CheckCircle2 size={14} className="text-green-600" />;
    case "modified":
      return <CheckCircle2 size={14} className="text-blue-500" />;
    case "rejected":
      return <XCircle size={14} className="text-muted-foreground/50" />;
  }
}

function ActionButton({
  label,
  variant,
  busy,
  onClick,
}: {
  label: string;
  variant: "accept" | "reject";
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn(
        "rounded px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50",
        variant === "accept"
          ? "bg-green-600/10 text-green-700 hover:bg-green-600/20"
          : "bg-destructive/10 text-destructive hover:bg-destructive/20",
      )}
    >
      {label}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="flex h-32 items-center justify-center gap-2 text-muted-foreground">
      <Loader2 size={16} className="animate-spin" />
      <span className="text-sm">Loading proposals…</span>
    </div>
  );
}

function EmptyState({ statusTab }: { statusTab: StatusTab }) {
  const message =
    statusTab === "all"
      ? "No proposals yet — run analysis on profiled sources."
      : `No ${statusTab} proposals.`;
  return (
    <div className="flex h-32 items-center justify-center p-8">
      <p className="text-center text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "modified", label: "Modified" },
  { value: "rejected", label: "Rejected" },
];

const ORIGIN_FILTERS: { value: OriginFilter; label: string }[] = [
  { value: "all", label: "All origins" },
  { value: "declared_fk", label: "FK" },
  { value: "heuristic", label: "Heuristic" },
];

const KIND_LABEL: Record<Proposal["kind"], string> = {
  foreign_key: "Declared FK",
  soft_foreign_key: "Soft FK",
  column_name_similarity: "Name sim.",
  sample_value_overlap: "Value overlap",
  embedding_similarity: "Embedding",
  llm_reasoning: "LLM",
};
