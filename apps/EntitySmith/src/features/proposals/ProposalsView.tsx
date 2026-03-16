import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProposals } from "@/hooks/useProposals";
import type { Proposal, ProposalReason, ProposalStatus } from "@/types";

type StatusTab = "all" | ProposalStatus;
type OriginFilter = "all" | "declared_fk" | "heuristic";

// ── Tooltip helper ─────────────────────────────────────────────────────────────

function Tip({
  children,
  content,
  side = "top",
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

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProposalsViewProps {
  projectId: string;
  selectedProposalId: string | null;
  onProposalSelect: (proposal: Proposal | null) => void;
}

// ── Main component ─────────────────────────────────────────────────────────────

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

  const filtered = proposals.filter((p) => {
    const statusOk = statusTab === "all" || p.status === statusTab;
    const originOk =
      originFilter === "all" ||
      p.reasons.some((r) => r.origin === originFilter);
    return statusOk && originOk;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          {STATUS_TABS.map((tab) => (
            <Tip key={tab.value} content={tab.tip} side="bottom">
              <button
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
            </Tip>
          ))}
          <div className="mx-1 h-4 w-px bg-border" />
          {ORIGIN_FILTERS.map((f) => (
            <Tip key={f.value} content={f.tip} side="bottom">
              <button
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
            </Tip>
          ))}
        </div>

        <Tip
          content="Analyse all registered and profiled sources to detect connection proposals. Runs FK detection, naming-pattern heuristics, and value overlap checks. Previously accepted or rejected proposals are preserved."
          side="bottom"
        >
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
        </Tip>
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

// ── ProposalRow ────────────────────────────────────────────────────────────────

type Direction = "forward" | "reverse" | "both";

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
    reversed?: boolean,
    inversePredicate?: string,
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
  const [direction, setDirection] = useState<Direction>("forward");
  const [editInversePredicate, setEditInversePredicate] = useState("");

  const isPending = p.status === "pending";
  const effectivePredicate = p.reviewedPredicate ?? p.suggestedPredicate;

  const reversed = direction === "reverse";
  const inversePredicate = direction === "both" ? editInversePredicate : undefined;

  async function handle(action: "accept" | "reject" | "modify") {
    setBusy(true);
    try {
      await onReview(
        p.id,
        action,
        action === "modify" ? editPredicate : undefined,
        action === "modify" ? editCardinality : undefined,
        reversed,
        inversePredicate,
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
            <Tip
              content="Relationship predicate — the named edge in the graph. This is the RDF property that will link the two entity types in the exported knowledge graph."
              side="top"
            >
              <span className="font-mono text-[11px] text-primary cursor-help">
                {effectivePredicate}
              </span>
            </Tip>
            <ArrowRight size={12} className="shrink-0 text-muted-foreground" />
            <EntityChip entity={p.toEntity} column={p.toColumn} />
          </div>

          {/* Meta row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ConfidenceBadge confidence={p.confidence} />

            {/* One kind badge per reason */}
            {p.reasons.map((r, i) => (
              <KindBadge key={i} kind={r.kind} />
            ))}

            {/* Multi-method indicator */}
            {p.reasons.length > 1 && (
              <Tip
                content={`This connection was independently detected by ${p.reasons.length} different analysis methods. Multiple signals increase confidence that the relationship is real. Combined confidence uses the independent-evidence formula: 1 − Π(1 − cᵢ).`}
                side="top"
              >
                <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-semibold text-primary cursor-help">
                  <Layers size={8} />
                  {p.reasons.length} methods
                </span>
              </Tip>
            )}

            {p.suggestedCardinality !== "unknown" && (
              <Tip
                content="Expected multiplicity: 1:1 (one-to-one), 1:N (one-to-many), or N:N (many-to-many). Inferred from the distribution of values in the sample data."
                side="top"
              >
                <span className="text-[10px] text-muted-foreground cursor-help">
                  {p.suggestedCardinality}
                </span>
              </Tip>
            )}
          </div>
        </div>

        {/* Actions */}
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {isPending && !expanded && (
            <>
              <Tip
                content="Accept this proposal: creates canonical entity types for both endpoints and adds the relationship to the schema graph. Expand to customise direction or add an inverse."
                side="top"
              >
                <ActionButton
                  label="Accept"
                  variant="accept"
                  busy={busy}
                  onClick={() => handle("accept")}
                />
              </Tip>
              <Tip
                content="Reject this proposal: marks it as dismissed. It will not be reintroduced by future analysis runs."
                side="top"
              >
                <ActionButton
                  label="Reject"
                  variant="reject"
                  busy={busy}
                  onClick={() => handle("reject")}
                />
              </Tip>
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
        <div className="border-t border-border/50 bg-muted/20 px-4 py-3 space-y-3">
          {/* Per-reason evidence sections */}
          {p.reasons.map((reason, i) => (
            <ReasonSection key={i} reason={reason} showDivider={i > 0} />
          ))}

          {/* Edit + action row */}
          {isPending && (
            <div className="flex flex-col gap-3 border-t border-border/50 pt-3">
              {/* Direction selector */}
              <div className="flex flex-col gap-1">
                <Tip
                  content="Choose which direction(s) to add to the schema graph. Forward adds A→B, Reverse adds B→A, Both adds A→B and B→A with separate predicate names."
                  side="top"
                >
                  <label className="text-[10px] text-muted-foreground cursor-help">Direction</label>
                </Tip>
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="font-mono text-muted-foreground">{p.fromEntity}</span>
                  <div className="flex rounded border border-border overflow-hidden">
                    {(["forward", "both", "reverse"] as Direction[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDirection(d)}
                        className={cn(
                          "px-2 py-0.5 text-[11px] transition-colors",
                          direction === d
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {d === "forward" ? "→" : d === "reverse" ? "←" : "↔"}
                      </button>
                    ))}
                  </div>
                  <span className="font-mono text-muted-foreground">{p.toEntity}</span>
                </div>
              </div>

              {/* Predicate(s) + cardinality row */}
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Tip
                    content={
                      direction === "reverse"
                        ? `Predicate for the reverse relationship: ${p.toEntity} → ${p.fromEntity}`
                        : `Predicate for the forward relationship: ${p.fromEntity} → ${p.toEntity}`
                    }
                    side="top"
                  >
                    <label className="text-[10px] text-muted-foreground cursor-help">
                      {direction === "reverse" ? "Predicate (←)" : "Predicate (→)"}
                    </label>
                  </Tip>
                  <input
                    type="text"
                    value={editPredicate}
                    onChange={(e) => setEditPredicate(e.target.value)}
                    className="h-7 rounded border border-border bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {direction === "both" && (
                  <div className="flex flex-col gap-1">
                    <Tip
                      content={`Predicate for the inverse relationship: ${p.toEntity} → ${p.fromEntity}. Leave empty to skip.`}
                      side="top"
                    >
                      <label className="text-[10px] text-muted-foreground cursor-help">
                        Inverse predicate (←)
                      </label>
                    </Tip>
                    <input
                      type="text"
                      placeholder="e.g. works for"
                      value={editInversePredicate}
                      onChange={(e) => setEditInversePredicate(e.target.value)}
                      className="h-7 rounded border border-border bg-background px-2 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <Tip
                    content="How many target entities each source entity relates to."
                    side="top"
                  >
                    <label className="text-[10px] text-muted-foreground cursor-help">
                      Cardinality
                    </label>
                  </Tip>
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
                  <Tip
                    content="Accept with your settings. Creates entity types and the configured relationship(s) in the schema graph."
                    side="top"
                  >
                    <ActionButton
                      label="Save & Accept"
                      variant="accept"
                      busy={busy}
                      onClick={() => handle("modify")}
                    />
                  </Tip>
                  <Tip
                    content="Reject this proposal. It will not be reintroduced by future analysis runs."
                    side="top"
                  >
                    <ActionButton
                      label="Reject"
                      variant="reject"
                      busy={busy}
                      onClick={() => handle("reject")}
                    />
                  </Tip>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ── ReasonSection ──────────────────────────────────────────────────────────────

function ReasonSection({
  reason,
  showDivider,
}: {
  reason: ProposalReason;
  showDivider: boolean;
}) {
  return (
    <div className={showDivider ? "border-t border-border/40 pt-3" : ""}>
      {/* Reason header */}
      <div className="mb-2 flex items-center gap-2">
        <KindBadge kind={reason.kind} />
        <ConfidenceBadge confidence={reason.confidence} />
      </div>
      {/* Evidence grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
        <EvidenceSection evidence={reason.evidence} kind={reason.kind} />
      </div>
    </div>
  );
}

// ── Evidence section ──────────────────────────────────────────────────────────

function EvidenceSection({
  evidence,
  kind,
}: {
  evidence: Record<string, unknown>;
  kind: ProposalReason["kind"];
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
          tip={
            kind === "foreign_key"
              ? "This FK was explicitly declared in the source schema (e.g. REFERENCES in SQLite). Near-certain relationship — confidence 0.95."
              : "This FK was inferred from column naming patterns (e.g. 'user_id' → 'users.id'). Not declared in the schema, but structurally matched — confidence 0.70."
          }
        />
        {linkCols && (
          <EvidenceRow
            label="Link"
            value={linkCols.map((c) => `${c.from} → ${c.to}`).join(", ")}
            tip="The column pair that links the two entities — the FK column on the source side and the referenced column (usually the PK) on the target side."
          />
        )}
        {evidence.to_pk && (
          <EvidenceRow
            label="Target PK"
            value={String(evidence.to_pk)}
            tip="The primary key column on the target entity that this FK column references."
          />
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
          tip="String similarity between the two column names using the Jaro-Winkler algorithm (0–1). Scores above 0.85 contribute to the confidence. Handles typos and abbreviations better than exact string matching."
        />
        <EvidenceRow
          label="Name score"
          value={fmt(evidence.name_score as number | undefined)}
          tip="Score for column name matching: +0.40 for an exact match, +0.30 for a normalized match (same after lowercasing and stripping separators like underscores and hyphens)."
        />
        <EvidenceRow
          label="FK pattern score"
          value={fmt(evidence.fk_pattern_score as number | undefined)}
          tip="Score for the FK naming pattern: a column named '{entity}_id' pointing at a table called '{entity}'. Contributes +0.80 when detected — the strongest single signal."
        />
        <EvidenceRow
          label="Value overlap"
          value={pct(evidence.value_overlap as number | undefined)}
          tip="Fraction of sample values shared between the two columns. High overlap means many values in one column appear in the other — strong evidence of a reference relationship."
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
          tip="Fraction of sample values shared between the two columns. This was the primary signal: a large proportion of values in one column appear in the other."
        />
        <EvidenceRow
          label="Name score"
          value={fmt(evidence.name_score as number | undefined)}
          tip="Additional score from column name matching. Contributes to overall confidence alongside the value overlap."
        />
      </>
    );
  }

  return <EvidenceRow label="Evidence" value={JSON.stringify(evidence)} />;
}

function EvidenceRow({
  label,
  value,
  tip,
}: {
  label: string;
  value: string;
  tip?: string;
}) {
  return (
    <>
      {tip ? (
        <Tip content={tip} side="left">
          <span className="text-muted-foreground cursor-help underline decoration-dotted underline-offset-2">
            {label}
          </span>
        </Tip>
      ) : (
        <span className="text-muted-foreground">{label}</span>
      )}
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

function EntityChip({ entity, column }: { entity: string; column: string }) {
  return (
    <Tip
      content={`Source entity "${entity}", column "${column}". This is one endpoint of the proposed relationship.`}
      side="top"
    >
      <span className="flex cursor-help items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
        <span className="text-foreground">{entity}</span>
        <span className="text-muted-foreground">.</span>
        <span className="text-muted-foreground">{column}</span>
      </span>
    </Tip>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const p = Math.round(confidence * 100);
  const color =
    p >= 85
      ? "text-green-600"
      : p >= 60
        ? "text-yellow-600"
        : "text-muted-foreground";
  const label =
    p >= 85 ? "High confidence" : p >= 60 ? "Medium confidence" : "Low confidence";

  return (
    <Tip
      content={`${label} (${p}%). Declared FKs score 95%, soft FK name patterns score 70%, cross-source heuristics vary by evidence strength. When multiple methods fire, confidence is combined as 1 − Π(1 − cᵢ).`}
      side="top"
    >
      <span className={cn("text-[10px] font-semibold tabular-nums cursor-help", color)}>
        {p}%
      </span>
    </Tip>
  );
}

function KindBadge({ kind }: { kind: ProposalReason["kind"] }) {
  return (
    <Tip content={KIND_TIP[kind]} side="top">
      <Badge variant="outline" className="h-4 px-1 text-[10px] cursor-help">
        {KIND_LABEL[kind]}
      </Badge>
    </Tip>
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

const STATUS_TABS: { value: StatusTab; label: string; tip: string }[] = [
  {
    value: "all",
    label: "All",
    tip: "Show all proposals regardless of status.",
  },
  {
    value: "pending",
    label: "Pending",
    tip: "Proposals not yet reviewed. These need your attention — accept to promote them into the schema graph, reject to dismiss.",
  },
  {
    value: "accepted",
    label: "Accepted",
    tip: "Proposals you accepted. Entity types and relationships have been created in the schema graph for each of these.",
  },
  {
    value: "modified",
    label: "Modified",
    tip: "Proposals accepted with a custom predicate or cardinality you edited. The modified values were used when creating the schema graph relationship.",
  },
  {
    value: "rejected",
    label: "Rejected",
    tip: "Proposals you dismissed. They are excluded from the graph and won't be reintroduced by future analysis runs.",
  },
];

const ORIGIN_FILTERS: { value: OriginFilter; label: string; tip: string }[] = [
  {
    value: "all",
    label: "All origins",
    tip: "Show proposals from all detection methods.",
  },
  {
    value: "declared_fk",
    label: "FK",
    tip: "Proposals that have at least one reason derived from a declared or inferred foreign key. Highest confidence — the source structure itself implies the relationship.",
  },
  {
    value: "heuristic",
    label: "Heuristic",
    tip: "Proposals that have at least one reason derived from column-name similarity (Jaro-Winkler, exact, normalized) or sample-value overlap. No LLM needed — purely structural analysis.",
  },
];

const KIND_LABEL: Record<ProposalReason["kind"], string> = {
  foreign_key: "Declared FK",
  soft_foreign_key: "Soft FK",
  column_name_similarity: "Name sim.",
  sample_value_overlap: "Value overlap",
  embedding_similarity: "Embedding",
  llm_reasoning: "LLM",
};

const KIND_TIP: Record<ProposalReason["kind"], string> = {
  foreign_key:
    "Declared foreign key — a REFERENCES constraint explicitly defined in the source schema. Near-certain relationship, confidence 0.95.",
  soft_foreign_key:
    "Soft foreign key — inferred from column naming patterns (e.g. 'user_id' column alongside a 'users' table). Not declared, but structurally matched. Confidence 0.70.",
  column_name_similarity:
    "Detected by column-name similarity across two sources: exact name match, normalized match (case/separator-insensitive), or Jaro-Winkler string distance above 0.85.",
  sample_value_overlap:
    "Detected because two columns across sources share a large fraction of their sample values — strong evidence that one column references the other.",
  embedding_similarity:
    "Detected by semantic similarity between column names and sample values, computed using a text embedding model.",
  llm_reasoning:
    "Suggested by an LLM that analysed both source entities in context and reasoned about whether a connection exists.",
};
