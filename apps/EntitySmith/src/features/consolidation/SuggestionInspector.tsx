import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Database, Loader2, Plus, Table2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AttributeAlignment,
  EntityComparisonData,
  SourceAttributeProfile,
} from "@/types";

type SampleRow = Record<string, string | null>;
type TabMode = "schema" | "data";

interface SuggestionInspectorProps {
  entityASourceId: string;
  entityAName: string;
  entityBSourceId: string;
  entityBName: string;
  entityASourceName?: string;
  entityBSourceName?: string;
  /** When set, compare the merged entity type (all bindings) against entity B */
  entityTypeId?: string;
  onClose: () => void;
  /** When provided, shows an "Add to Entity" button in the footer. */
  onAdd?: () => Promise<void>;
}

export function SuggestionInspector({
  entityASourceId,
  entityAName,
  entityBSourceId,
  entityBName,
  entityASourceName,
  entityBSourceName,
  entityTypeId,
  onClose,
  onAdd,
}: SuggestionInspectorProps) {
  const [data, setData] = useState<EntityComparisonData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [samplesA, setSamplesA] = useState<SampleRow[] | null>(null);
  const [samplesB, setSamplesB] = useState<SampleRow[] | null>(null);
  const [tab, setTab] = useState<TabMode>("schema");
  // Join keys: canonical column names the user picks for matching rows
  const [joinKeys, setJoinKeys] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    // If entityTypeId is provided, compare the merged entity type against the candidate.
    // Otherwise, compare two individual source entities.
    const loadComparison = entityTypeId
      ? invoke<EntityComparisonData>("get_entity_type_comparison", {
          entityTypeId,
          candidateSourceId: entityBSourceId,
          candidateEntityName: entityBName,
        })
      : invoke<EntityComparisonData>("get_entity_comparison", {
          entityASourceId,
          entityAName,
          entityBSourceId,
          entityBName,
        });

    // For entity type comparison, load combined sample rows from all bound sources.
    const loadSamplesA = entityTypeId
      ? invoke<SampleRow[]>("get_entity_type_sample_rows", {
          entityTypeId,
          limit: 5,
        }).catch(() => null)
      : invoke<SampleRow[]>("get_sample_rows", {
          sourceId: entityASourceId,
          entityName: entityAName,
          limit: 5,
        }).catch(() => null);

    const loadSamplesB = invoke<SampleRow[]>("get_sample_rows", {
      sourceId: entityBSourceId,
      entityName: entityBName,
      limit: 5,
    }).catch(() => null);

    Promise.all([loadComparison, loadSamplesA, loadSamplesB])
      .then(([comparison, sA, sB]) => {
        setData(comparison);
        setSamplesA(sA);
        setSamplesB(sB);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setIsLoading(false));
  }, [entityASourceId, entityAName, entityBSourceId, entityBName, entityTypeId]);

  const mergeFactors = data
    ? computeMergeFactors(
        data.attributeAlignments,
        data.entityA.attributes,
        data.entityB.attributes,
        data.scoringDetails,
      )
    : null;
  const pct = mergeFactors ? Math.round(mergeFactors.composite * 100) : 0;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />

      <div className="fixed inset-4 z-50 mx-auto flex max-w-[1400px] flex-col rounded-lg border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-base font-semibold truncate">
              {entityAName}
              <span className="text-muted-foreground mx-2">↔</span>
              {entityBName}
            </h2>
            {data && (
              <Badge
                variant={pct >= 80 ? "default" : pct >= 60 ? "secondary" : "outline"}
                className="text-xs shrink-0"
              >
                {pct}% match
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Tab toggle */}
            {data && (
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  onClick={() => setTab("schema")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                    tab === "schema"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Database size={13} />
                  Schema
                </button>
                <button
                  onClick={() => setTab("data")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${
                    tab === "data"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Table2 size={13} />
                  Data
                </button>
              </div>
            )}

            <button onClick={onClose} className="rounded p-1 hover:bg-muted shrink-0">
              <X size={18} />
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            Loading comparison…
          </div>
        )}

        {error && (
          <div className="px-6 py-4 text-sm text-destructive">{error}</div>
        )}

        {data && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {tab === "schema" ? (
                <SchemaTab
                  data={data}
                  entityAName={entityAName}
                  entityBName={entityBName}
                  entityASourceName={entityASourceName}
                  entityBSourceName={entityBSourceName}
                  joinKeys={joinKeys}
                  onToggleJoinKey={(key) => {
                    setJoinKeys((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    });
                  }}
                />
              ) : (
                <DataTab
                  data={data}
                  samplesA={samplesA}
                  samplesB={samplesB}
                  entityAName={entityAName}
                  entityBName={entityBName}
                  joinKeys={joinKeys}
                />
              )}
            </div>
          </div>
        )}

        {/* Footer with Add action */}
        {onAdd && data && (
          <div className="shrink-0 flex items-center justify-between border-t border-border px-6 py-3">
            <div className="text-xs text-muted-foreground">
              {joinKeys.size > 0 ? (
                <span>
                  Join keys: <span className="font-mono font-medium text-foreground">{[...joinKeys].join(", ")}</span>
                </span>
              ) : (
                <span>No join keys selected — select them in the Schema tab before adding.</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              {added ? (
                <Button size="sm" disabled className="gap-1.5">
                  <Check size={14} />
                  Added
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={isAdding}
                  onClick={async () => {
                    setIsAdding(true);
                    try {
                      await onAdd();
                      setAdded(true);
                      setTimeout(() => onClose(), 600);
                    } finally {
                      setIsAdding(false);
                    }
                  }}
                >
                  {isAdding ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  {isAdding ? "Adding…" : "Add to Entity"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Schema Tab ────────────────────────────────────────────────────────────────

function SchemaTab({
  data,
  entityAName,
  entityBName,
  entityASourceName,
  entityBSourceName,
  joinKeys,
  onToggleJoinKey,
}: {
  data: EntityComparisonData;
  entityAName: string;
  entityBName: string;
  entityASourceName?: string;
  entityBSourceName?: string;
  joinKeys: Set<string>;
  onToggleJoinKey: (key: string) => void;
}) {
  // Build lookup maps for attribute profiles
  const attrsAMap = new Map(data.entityA.attributes.map((a) => [a.name, a]));
  const attrsBMap = new Map(data.entityB.attributes.map((a) => [a.name, a]));

  return (
    <>
      {/* Summary bar */}
      <div className="flex items-center gap-6 rounded-md border border-border bg-muted/20 px-5 py-3 text-sm">
        <div>
          <span className="font-medium">{entityAName}</span>
          {entityASourceName && (
            <span className="text-muted-foreground ml-1.5 text-xs">({entityASourceName})</span>
          )}
          <span className="text-muted-foreground ml-2 text-xs">
            {data.entityA.profile.rowCount.toLocaleString()} rows · {data.entityA.attributes.length} cols
          </span>
        </div>
        <span className="text-muted-foreground">↔</span>
        <div>
          <span className="font-medium">{entityBName}</span>
          {entityBSourceName && (
            <span className="text-muted-foreground ml-1.5 text-xs">({entityBSourceName})</span>
          )}
          <span className="text-muted-foreground ml-2 text-xs">
            {data.entityB.profile.rowCount.toLocaleString()} rows · {data.entityB.attributes.length} cols
          </span>
        </div>
      </div>

      {/* Column Alignment */}
      <div>
        <div className="flex items-end justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Column Alignment
          </h3>
          {joinKeys.size > 0 && (
            <span className="text-xs text-muted-foreground">
              {joinKeys.size} join key{joinKeys.size !== 1 && "s"} selected
            </span>
          )}
        </div>
        <div className="rounded-md border border-border overflow-hidden">
          <div className="grid grid-cols-[32px_1fr_100px_1fr] gap-0 bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border">
            <span className="text-center" title="Select as join key">Key</span>
            <span>{entityAName}</span>
            <span className="text-center">Match</span>
            <span>{entityBName}</span>
          </div>
          {data.attributeAlignments.map((a, i) => (
            <AlignmentRow
              key={i}
              alignment={a}
              attrA={a.sourceAColumn ? attrsAMap.get(a.sourceAColumn) : undefined}
              attrB={a.sourceBColumn ? attrsBMap.get(a.sourceBColumn) : undefined}
              isJoinKey={joinKeys.has(a.sourceAColumn ?? a.sourceBColumn ?? "")}
              onToggleJoinKey={() => {
                const canonical = a.sourceAColumn ?? a.sourceBColumn ?? "";
                if (canonical) onToggleJoinKey(canonical);
              }}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Select join keys to define how rows from both sources should be matched in the combined data view.
        </p>
      </div>

      {/* Merge Score */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Merge Score
        </h3>
        <MergeScore
          alignments={data.attributeAlignments}
          attrsA={data.entityA.attributes}
          attrsB={data.entityB.attributes}
          scoringDetails={data.scoringDetails}
          entityAName={entityAName}
          entityBName={entityBName}
        />
      </div>
    </>
  );
}

// ── Data Tab ──────────────────────────────────────────────────────────────────

type DataViewMode = "side-by-side" | "merged";

function DataTab({
  data,
  samplesA,
  samplesB,
  entityAName,
  entityBName,
  joinKeys,
}: {
  data: EntityComparisonData;
  samplesA: SampleRow[] | null;
  samplesB: SampleRow[] | null;
  entityAName: string;
  entityBName: string;
  joinKeys: Set<string>;
}) {
  const [viewMode, setViewMode] = useState<DataViewMode>("side-by-side");
  const hasJoinKeys = joinKeys.size > 0;

  // Reset to side-by-side if keys are deselected while in merged mode
  const effectiveMode = hasJoinKeys ? viewMode : "side-by-side";

  return (
    <>
      {/* Combined Data Table */}
      {(samplesA || samplesB) && (
        <div>
          <div className="flex items-end justify-between mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Combined Data Sample
            </h3>
            {hasJoinKeys && (
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  onClick={() => setViewMode("side-by-side")}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    effectiveMode === "side-by-side"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  Side by Side
                </button>
                <button
                  onClick={() => setViewMode("merged")}
                  className={`px-2.5 py-1 text-[11px] font-medium transition-colors border-l border-border ${
                    effectiveMode === "merged"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  Merged
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {effectiveMode === "side-by-side"
              ? hasJoinKeys
                ? "Rows from both sources shown separately, paired by join keys."
                : "Rows from both sources shown separately. Select join keys in the Schema tab to enable merging."
              : "Rows merged on selected join keys — values from A preferred, B used as fallback."}
          </p>
          {effectiveMode === "side-by-side" ? (
            <MergedDataTable
              alignments={data.attributeAlignments}
              samplesA={samplesA ?? []}
              samplesB={samplesB ?? []}
              entityAName={entityAName}
              entityBName={entityBName}
              joinKeys={joinKeys}
            />
          ) : (
            <FlatMergedDataTable
              alignments={data.attributeAlignments}
              samplesA={samplesA ?? []}
              samplesB={samplesB ?? []}
              entityAName={entityAName}
              entityBName={entityBName}
              joinKeys={joinKeys}
            />
          )}
        </div>
      )}

      {!samplesA && !samplesB && (
        <div className="rounded-md border border-border px-5 py-8 text-center text-sm text-muted-foreground">
          No sample data available for these sources.
        </div>
      )}
    </>
  );
}

function PercentBar({ value, color }: { value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

// ── Alignment Row ─────────────────────────────────────────────────────────────

function AlignmentRow({
  alignment: a,
  attrA,
  attrB,
  isJoinKey,
  onToggleJoinKey,
}: {
  alignment: AttributeAlignment;
  attrA?: SourceAttributeProfile;
  attrB?: SourceAttributeProfile;
  isJoinKey: boolean;
  onToggleJoinKey: () => void;
}) {
  const isExact = a.matchType === "exact";
  const isInferred = a.matchType === "inferred";
  const isMatched = isExact || isInferred;
  const isUnmatchedA = a.matchType === "unmatched_a";
  const isUnmatchedB = a.matchType === "unmatched_b";
  const pct = Math.round(a.confidence * 100);

  return (
    <div className={`grid grid-cols-[32px_1fr_100px_1fr] gap-0 border-b border-border/40 px-4 py-2 text-sm last:border-b-0 ${isJoinKey ? "bg-primary/[0.04]" : ""}`}>
      {/* Join key checkbox */}
      <div className="flex items-center justify-center">
        {isMatched ? (
          <button
            onClick={onToggleJoinKey}
            className={`h-4 w-4 rounded border flex items-center justify-center text-[10px] transition-colors ${
              isJoinKey
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/30 hover:border-muted-foreground/60"
            }`}
          >
            {isJoinKey && "✓"}
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className={`${isUnmatchedB ? "opacity-30" : ""}`}>
        {a.sourceAColumn && (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs">{a.sourceAColumn}</span>
              {a.sourceAType && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  {a.sourceAType}
                </Badge>
              )}
              {attrA?.isPk && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                  PK
                </Badge>
              )}
              {attrA?.isNullable && (
                <span className="text-[10px] text-muted-foreground/60">nullable</span>
              )}
            </div>
            {attrA && (
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>null {Math.round(attrA.nullPct * 100)}%</span>
                <span>unique {Math.round(attrA.uniquePct * 100)}%</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5">
        {(isExact || isInferred) && (
          <>
            <div className="flex items-center">
              <div
                className={`h-0 w-6 border-t ${
                  isExact ? "border-primary border-2" : "border-muted-foreground border-dashed"
                }`}
              />
              <div
                className={`h-0 w-0 border-l-4 border-y-[3px] border-y-transparent ${
                  isExact ? "border-l-primary" : "border-l-muted-foreground"
                }`}
              />
            </div>
            <span className={`text-xs tabular-nums ${isExact ? "text-primary" : "text-muted-foreground"}`}>
              {pct}%
            </span>
          </>
        )}
        {isUnmatchedA && (
          <span className="text-xs text-muted-foreground/50">only A</span>
        )}
        {isUnmatchedB && (
          <span className="text-xs text-muted-foreground/50">only B</span>
        )}
      </div>

      <div className={`${isUnmatchedA ? "opacity-30" : ""}`}>
        {a.sourceBColumn && (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs">{a.sourceBColumn}</span>
              {a.sourceBType && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  {a.sourceBType}
                </Badge>
              )}
              {attrB?.isPk && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                  PK
                </Badge>
              )}
              {attrB?.isNullable && (
                <span className="text-[10px] text-muted-foreground/60">nullable</span>
              )}
            </div>
            {attrB && (
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>null {Math.round(attrB.nullPct * 100)}%</span>
                <span>unique {Math.round(attrB.uniquePct * 100)}%</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Merge Score ───────────────────────────────────────────────────────────────
//
// Composite score measuring how well two datasets can be united into a
// comprehensive merged dataset. Five weighted factors:
//
//   Schema Overlap  (25%) — Dice coefficient of matched columns
//   Value Overlap   (30%) — Average Jaccard of top values across matched cols
//   Type Alignment  (15%) — Fraction of matched columns sharing the same type
//   Completeness    (15%) — How well the sources fill each other's null gaps
//   Name Similarity (15%) — Table name + column name similarity
//
// The emphasis is on *data overlap* (value overlap gets the highest weight)
// because that's the strongest signal for whether two tables describe the same
// real-world entities and can be meaningfully joined.

interface ColumnComparison {
  canonical: string;
  colA: string;
  colB: string;
  typeA: string;
  typeB: string;
  typeMatch: boolean;
  nullPctA: number;
  nullPctB: number;
  uniquePctA: number;
  uniquePctB: number;
  valueOverlap: number | null;
  rangeA: string | null;
  rangeB: string | null;
  topValuesA: { value: string; count: number }[];
  topValuesB: { value: string; count: number }[];
}

export function computeMergeFactors(
  alignments: AttributeAlignment[],
  attrsA: SourceAttributeProfile[],
  attrsB: SourceAttributeProfile[],
  scoringDetails: Record<string, unknown>,
) {
  const matched = alignments.filter(
    (a) => a.matchType === "exact" || a.matchType === "inferred",
  );
  const matchedCount = matched.length;
  const totalA = attrsA.length;
  const totalB = attrsB.length;

  // Build per-column comparisons
  const columns: ColumnComparison[] = [];
  for (const m of matched) {
    const attrA = attrsA.find((a) => a.name === m.sourceAColumn);
    const attrB = attrsB.find((a) => a.name === m.sourceBColumn);
    if (!attrA || !attrB) continue;

    let valueOverlap: number | null = null;
    if (attrA.topValues.length > 0 && attrB.topValues.length > 0) {
      const valsA = new Set(attrA.topValues.map((v) => v.value));
      const valsB = new Set(attrB.topValues.map((v) => v.value));
      const intersection = [...valsA].filter((v) => valsB.has(v)).length;
      const union = new Set([...valsA, ...valsB]).size;
      valueOverlap = union > 0 ? intersection / union : null;
    }

    columns.push({
      canonical: m.sourceAColumn ?? m.sourceBColumn ?? "",
      colA: m.sourceAColumn ?? "",
      colB: m.sourceBColumn ?? "",
      typeA: attrA.inferredType,
      typeB: attrB.inferredType,
      typeMatch: attrA.inferredType === attrB.inferredType,
      nullPctA: attrA.nullPct,
      nullPctB: attrB.nullPct,
      uniquePctA: attrA.uniquePct,
      uniquePctB: attrB.uniquePct,
      valueOverlap,
      rangeA: attrA.minValue != null ? `${attrA.minValue} – ${attrA.maxValue ?? "?"}` : null,
      rangeB: attrB.minValue != null ? `${attrB.minValue} – ${attrB.maxValue ?? "?"}` : null,
      topValuesA: attrA.topValues,
      topValuesB: attrB.topValues,
    });
  }

  // 1. Schema Overlap — Dice coefficient: 2*matched / (colsA + colsB)
  const schemaOverlap = totalA + totalB > 0 ? (2 * matchedCount) / (totalA + totalB) : 0;

  // 2. Value Overlap — average Jaccard across matched columns (only those with data)
  const colsWithOverlap = columns.filter((c) => c.valueOverlap != null);
  const valueOverlapAvg =
    colsWithOverlap.length > 0
      ? colsWithOverlap.reduce((sum, c) => sum + c.valueOverlap!, 0) / colsWithOverlap.length
      : 0;

  // 3. Type Alignment — fraction of matched columns with same type
  const typeAlignmentCount = columns.filter((c) => c.typeMatch).length;
  const typeAlignment = columns.length > 0 ? typeAlignmentCount / columns.length : 0;

  // 4. Completeness — how well sources complement each other's nulls.
  //    For each matched column, the "combined completeness" is:
  //    1 - (nullPctA * nullPctB)  (probability both are null simultaneously)
  //    We average this and compare to the average individual completeness.
  const completeness =
    columns.length > 0
      ? columns.reduce((sum, c) => {
          const combinedNonNull = 1 - c.nullPctA * c.nullPctB;
          return sum + combinedNonNull;
        }, 0) / columns.length
      : 0;

  // 5. Name Similarity — from backend scoring details
  const entityNameSim = (scoringDetails.entity_name_similarity as number) ?? 0;
  const avgColNameSim = (scoringDetails.avg_name_similarity as number) ?? 0;
  const nameSimilarity = (entityNameSim + avgColNameSim) / 2;

  // Weighted composite
  const weights = {
    schemaOverlap: 0.25,
    valueOverlap: 0.30,
    typeAlignment: 0.15,
    completeness: 0.15,
    nameSimilarity: 0.15,
  };

  const composite =
    weights.schemaOverlap * schemaOverlap +
    weights.valueOverlap * valueOverlapAvg +
    weights.typeAlignment * typeAlignment +
    weights.completeness * completeness +
    weights.nameSimilarity * nameSimilarity;

  const exactCount = alignments.filter((a) => a.matchType === "exact").length;
  const inferredCount = alignments.filter((a) => a.matchType === "inferred").length;
  const unmatchedA = alignments.filter((a) => a.matchType === "unmatched_a").length;
  const unmatchedB = alignments.filter((a) => a.matchType === "unmatched_b").length;

  return {
    composite,
    factors: {
      schemaOverlap,
      valueOverlap: valueOverlapAvg,
      typeAlignment,
      completeness,
      nameSimilarity,
    },
    weights,
    matchedCount,
    exactCount,
    inferredCount,
    unmatchedA,
    unmatchedB,
    totalA,
    totalB,
    typeAlignmentCount,
    colsWithOverlapCount: colsWithOverlap.length,
    columns,
  };
}

function scoreColor(value: number): string {
  if (value >= 0.8) return "text-green-600";
  if (value >= 0.5) return "text-amber-600";
  return "text-red-500";
}

function scoreBarColor(value: number): string {
  if (value >= 0.8) return "bg-green-500";
  if (value >= 0.5) return "bg-amber-500";
  return "bg-red-400";
}

function MergeScore({
  alignments,
  attrsA,
  attrsB,
  scoringDetails,
  entityAName,
  entityBName,
}: {
  alignments: AttributeAlignment[];
  attrsA: SourceAttributeProfile[];
  attrsB: SourceAttributeProfile[];
  scoringDetails: Record<string, unknown>;
  entityAName: string;
  entityBName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const m = computeMergeFactors(alignments, attrsA, attrsB, scoringDetails);
  const compositePct = Math.round(m.composite * 100);

  const factors: {
    key: string;
    label: string;
    value: number;
    weight: number;
    detail: string;
  }[] = [
    {
      key: "valueOverlap",
      label: "Value Overlap",
      value: m.factors.valueOverlap,
      weight: m.weights.valueOverlap,
      detail:
        m.colsWithOverlapCount > 0
          ? `Average Jaccard similarity of top values across ${m.colsWithOverlapCount} column${m.colsWithOverlapCount !== 1 ? "s" : ""}`
          : "No top-value data available for matched columns",
    },
    {
      key: "schemaOverlap",
      label: "Schema Overlap",
      value: m.factors.schemaOverlap,
      weight: m.weights.schemaOverlap,
      detail: `${m.matchedCount} of ${m.totalA + m.totalB} columns matched (${m.exactCount} exact, ${m.inferredCount} inferred) · ${m.unmatchedA} only A, ${m.unmatchedB} only B`,
    },
    {
      key: "typeAlignment",
      label: "Type Alignment",
      value: m.factors.typeAlignment,
      weight: m.weights.typeAlignment,
      detail: `${m.typeAlignmentCount} of ${m.matchedCount} matched columns share the same data type`,
    },
    {
      key: "completeness",
      label: "Completeness",
      value: m.factors.completeness,
      weight: m.weights.completeness,
      detail: "How well the sources fill each other's null gaps when combined",
    },
    {
      key: "nameSimilarity",
      label: "Name Similarity",
      value: m.factors.nameSimilarity,
      weight: m.weights.nameSimilarity,
      detail: "Average of table name and column name similarity (Jaro-Winkler)",
    },
  ];

  return (
    <div className="rounded-md border border-border overflow-hidden">
      {/* Overall score header */}
      <div className="flex items-center gap-4 px-5 py-3.5 bg-muted/20 border-b border-border">
        <div className="flex items-center gap-3 flex-1">
          <span className={`text-2xl font-bold tabular-nums ${scoreColor(m.composite)}`}>
            {compositePct}%
          </span>
          <div className="flex-1">
            <div className="h-3 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${scoreBarColor(m.composite)}`}
                style={{ width: `${compositePct}%` }}
              />
            </div>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {compositePct >= 80
            ? "Highly compatible — strong candidate for merging"
            : compositePct >= 50
              ? "Moderately compatible — review column details"
              : "Low compatibility — datasets may describe different things"}
        </span>
      </div>

      {/* Factor breakdown */}
      <div className="divide-y divide-border/40">
        {factors.map((f) => {
          const pct = Math.round(f.value * 100);
          const contribution = Math.round(f.value * f.weight * 100);
          return (
            <div key={f.key} className="flex items-center gap-4 px-5 py-2.5">
              <div className="w-36 shrink-0">
                <span className="text-sm font-medium">{f.label}</span>
                <span className="text-[10px] text-muted-foreground ml-1.5">
                  ×{Math.round(f.weight * 100)}%
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground truncate">{f.detail}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${scoreBarColor(f.value)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`text-sm tabular-nums w-10 text-right font-medium ${scoreColor(f.value)}`}>
                  {pct}%
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                  +{contribution}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-column detail (expandable) */}
      {m.columns.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-5 py-2 bg-muted/10 border-t border-border text-xs text-muted-foreground hover:bg-muted/20 transition-colors"
          >
            <span>
              {expanded ? "Hide" : "Show"} per-column data compatibility ({m.columns.length} columns)
            </span>
            <span className="text-[10px]">{expanded ? "▲" : "▼"}</span>
          </button>
          {expanded && (
            <div className="border-t border-border divide-y divide-border/40">
              {m.columns.map((c, i) => (
                <div key={i} className="px-5 py-3">
                  {/* Column name + type */}
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-xs font-medium">{c.canonical}</span>
                    {c.colA !== c.colB && (
                      <span className="text-[10px] text-muted-foreground">
                        ({c.colA} ↔ {c.colB})
                      </span>
                    )}
                    <div className="flex-1" />
                    {c.typeMatch ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-green-500/50 text-green-600">
                        {c.typeA}
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/50 text-amber-600">
                          {c.typeA}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">→</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/50 text-amber-600">
                          {c.typeB}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Side-by-side stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {entityAName}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground w-12">Nulls</span>
                        <PercentBar value={c.nullPctA} color="bg-red-400/60" />
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground w-12">Unique</span>
                        <PercentBar value={c.uniquePctA} color="bg-blue-400/60" />
                      </div>
                      {c.rangeA && (
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-muted-foreground w-12">Range</span>
                          <span className="font-mono text-[11px] truncate">{c.rangeA}</span>
                        </div>
                      )}
                      {c.topValuesA.length > 0 && (
                        <div className="flex items-start gap-3 text-xs">
                          <span className="text-muted-foreground w-12 pt-0.5">Top</span>
                          <div className="flex flex-wrap gap-1">
                            {c.topValuesA.map((v, j) => (
                              <span key={j} className="font-mono text-[10px] bg-muted/40 px-1.5 py-0.5 rounded">
                                {v.value}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {entityBName}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground w-12">Nulls</span>
                        <PercentBar value={c.nullPctB} color="bg-red-400/60" />
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground w-12">Unique</span>
                        <PercentBar value={c.uniquePctB} color="bg-blue-400/60" />
                      </div>
                      {c.rangeB && (
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-muted-foreground w-12">Range</span>
                          <span className="font-mono text-[11px] truncate">{c.rangeB}</span>
                        </div>
                      )}
                      {c.topValuesB.length > 0 && (
                        <div className="flex items-start gap-3 text-xs">
                          <span className="text-muted-foreground w-12 pt-0.5">Top</span>
                          <div className="flex flex-wrap gap-1">
                            {c.topValuesB.map((v, j) => (
                              <span key={j} className="font-mono text-[10px] bg-muted/40 px-1.5 py-0.5 rounded">
                                {v.value}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Value overlap */}
                  {c.valueOverlap != null && (
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/30">
                      <span className="text-xs text-muted-foreground">Value overlap:</span>
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-green-500/70"
                          style={{ width: `${Math.round(c.valueOverlap * 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium tabular-nums ${scoreColor(c.valueOverlap)}`}>
                        {Math.round(c.valueOverlap * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Merged Data Table ─────────────────────────────────────────────────────────

function MergedDataTable({
  alignments,
  samplesA,
  samplesB,
  entityAName,
  entityBName,
  joinKeys,
}: {
  alignments: AttributeAlignment[];
  samplesA: SampleRow[];
  samplesB: SampleRow[];
  entityAName: string;
  entityBName: string;
  joinKeys: Set<string>;
}) {
  // Build canonical columns with source info
  const columns: {
    canonical: string;
    colA: string | null;
    colB: string | null;
    from: "both" | "a_only" | "b_only";
    isJoinKey: boolean;
  }[] = [];

  for (const a of alignments) {
    if (a.matchType === "exact" || a.matchType === "inferred") {
      const canonical = a.sourceAColumn ?? a.sourceBColumn ?? "";
      columns.push({
        canonical,
        colA: a.sourceAColumn ?? null,
        colB: a.sourceBColumn ?? null,
        from: "both",
        isJoinKey: joinKeys.has(canonical),
      });
    } else if (a.matchType === "unmatched_a" && a.sourceAColumn) {
      columns.push({ canonical: a.sourceAColumn, colA: a.sourceAColumn, colB: null, from: "a_only", isJoinKey: false });
    } else if (a.matchType === "unmatched_b" && a.sourceBColumn) {
      columns.push({ canonical: a.sourceBColumn, colA: null, colB: a.sourceBColumn, from: "b_only", isJoinKey: false });
    }
  }

  // Build join key column mappings for matching
  const joinCols = columns.filter((c) => c.isJoinKey);

  // Match rows by join keys, or fall back to index-based pairing
  const rowPairs: { rowA: SampleRow | null; rowB: SampleRow | null }[] = [];

  if (joinCols.length > 0) {
    // Build a lookup for B rows by join key values
    const usedB = new Set<number>();

    for (const rowA of samplesA) {
      // Find matching B row
      let matchIdx = -1;
      for (let bi = 0; bi < samplesB.length; bi++) {
        if (usedB.has(bi)) continue;
        const rowB = samplesB[bi];
        const matches = joinCols.every((c) => {
          const valA = c.colA ? (rowA[c.colA] ?? null) : null;
          const valB = c.colB ? (rowB[c.colB] ?? null) : null;
          return valA != null && valB != null && valA === valB;
        });
        if (matches) {
          matchIdx = bi;
          break;
        }
      }

      if (matchIdx >= 0) {
        usedB.add(matchIdx);
        rowPairs.push({ rowA, rowB: samplesB[matchIdx] });
      } else {
        rowPairs.push({ rowA, rowB: null });
      }
    }

    // Add unmatched B rows
    for (let bi = 0; bi < samplesB.length; bi++) {
      if (!usedB.has(bi)) {
        rowPairs.push({ rowA: null, rowB: samplesB[bi] });
      }
    }
  } else {
    // No join keys selected — show all A rows then all B rows (no pairing)
    for (const rowA of samplesA) {
      rowPairs.push({ rowA, rowB: null });
    }
    for (const rowB of samplesB) {
      rowPairs.push({ rowA: null, rowB });
    }
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              {columns.map((col) => (
                <th
                  key={col.canonical}
                  className={`px-3 py-2 text-left whitespace-nowrap ${col.isJoinKey ? "bg-primary/[0.06]" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-medium text-foreground">{col.canonical}</span>
                    {col.isJoinKey && (
                      <Badge variant="default" className="text-[8px] px-1 py-0 h-3.5">
                        KEY
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {col.from === "both" ? (
                      <>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                        <span className="text-[9px] text-muted-foreground">both</span>
                      </>
                    ) : col.from === "a_only" ? (
                      <>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
                        <span className="text-[9px] text-muted-foreground">{entityAName}</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                        <span className="text-[9px] text-muted-foreground">{entityBName}</span>
                      </>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowPairs.map((pair, i) => (
              <>
                {/* Row from source A */}
                {pair.rowA && (
                  <tr
                    key={`a-${i}`}
                    className="border-b border-border/20 bg-blue-500/[0.03]"
                  >
                    {columns.map((col, j) => {
                      const val = col.colA ? (pair.rowA![col.colA] ?? null) : null;
                      return (
                        <td
                          key={j}
                          className={`px-3 py-1.5 whitespace-nowrap max-w-[150px] truncate ${
                            col.from === "b_only" ? "bg-muted/5" : ""
                          }`}
                          title={val ?? ""}
                        >
                          {j === 0 && (
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 mr-2 shrink-0" />
                          )}
                          {val != null ? (
                            <span className="font-mono">{val}</span>
                          ) : (
                            <span className="text-muted-foreground/30 italic">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}
                {/* Row from source B */}
                {pair.rowB && (
                  <tr
                    key={`b-${i}`}
                    className={`bg-amber-500/[0.03] ${
                      i < rowPairs.length - 1 ? "border-b-2 border-border/30" : "border-b border-border/20"
                    }`}
                  >
                    {columns.map((col, j) => {
                      const val = col.colB ? (pair.rowB![col.colB] ?? null) : null;
                      return (
                        <td
                          key={j}
                          className={`px-3 py-1.5 whitespace-nowrap max-w-[150px] truncate ${
                            col.from === "a_only" ? "bg-muted/5" : ""
                          }`}
                          title={val ?? ""}
                        >
                          {j === 0 && (
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 mr-2 shrink-0" />
                          )}
                          {val != null ? (
                            <span className="font-mono">{val}</span>
                          ) : (
                            <span className="text-muted-foreground/30 italic">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 bg-muted/10 border-t border-border text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
        <span>{columns.length} canonical columns</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
          {entityAName} ({samplesA.length} rows)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          {entityBName} ({samplesB.length} rows)
        </span>
        {joinCols.length > 0 ? (
          <span>Matched on: {joinCols.map((c) => c.canonical).join(", ")}</span>
        ) : (
          <span className="italic">No join keys selected. Select keys in the Schema tab to pair rows.</span>
        )}
      </div>
    </div>
  );
}

// ── Flat Merged Data Table ───────────────────────────────────────────────────

function FlatMergedDataTable({
  alignments,
  samplesA,
  samplesB,
  entityAName,
  entityBName,
  joinKeys,
}: {
  alignments: AttributeAlignment[];
  samplesA: SampleRow[];
  samplesB: SampleRow[];
  entityAName: string;
  entityBName: string;
  joinKeys: Set<string>;
}) {
  // Build canonical columns
  const columns: {
    canonical: string;
    colA: string | null;
    colB: string | null;
    from: "both" | "a_only" | "b_only";
    isJoinKey: boolean;
  }[] = [];

  for (const a of alignments) {
    if (a.matchType === "exact" || a.matchType === "inferred") {
      const canonical = a.sourceAColumn ?? a.sourceBColumn ?? "";
      columns.push({
        canonical,
        colA: a.sourceAColumn ?? null,
        colB: a.sourceBColumn ?? null,
        from: "both",
        isJoinKey: joinKeys.has(canonical),
      });
    } else if (a.matchType === "unmatched_a" && a.sourceAColumn) {
      columns.push({ canonical: a.sourceAColumn, colA: a.sourceAColumn, colB: null, from: "a_only", isJoinKey: false });
    } else if (a.matchType === "unmatched_b" && a.sourceBColumn) {
      columns.push({ canonical: a.sourceBColumn, colA: null, colB: a.sourceBColumn, from: "b_only", isJoinKey: false });
    }
  }

  const joinCols = columns.filter((c) => c.isJoinKey);

  // Pair rows by join keys or index
  const rowPairs: { rowA: SampleRow | null; rowB: SampleRow | null }[] = [];

  if (joinCols.length > 0) {
    const usedB = new Set<number>();
    for (const rowA of samplesA) {
      let matchIdx = -1;
      for (let bi = 0; bi < samplesB.length; bi++) {
        if (usedB.has(bi)) continue;
        const rowB = samplesB[bi];
        const matches = joinCols.every((c) => {
          const valA = c.colA ? (rowA[c.colA] ?? null) : null;
          const valB = c.colB ? (rowB[c.colB] ?? null) : null;
          return valA != null && valB != null && valA === valB;
        });
        if (matches) { matchIdx = bi; break; }
      }
      if (matchIdx >= 0) {
        usedB.add(matchIdx);
        rowPairs.push({ rowA, rowB: samplesB[matchIdx] });
      } else {
        rowPairs.push({ rowA, rowB: null });
      }
    }
    for (let bi = 0; bi < samplesB.length; bi++) {
      if (!usedB.has(bi)) rowPairs.push({ rowA: null, rowB: samplesB[bi] });
    }
  } else {
    // No join keys — show each row as its own entry
    for (const rowA of samplesA) {
      rowPairs.push({ rowA, rowB: null });
    }
    for (const rowB of samplesB) {
      rowPairs.push({ rowA: null, rowB });
    }
  }

  // Flatten each pair into a single merged row
  const mergedRows = rowPairs.map((pair) => {
    const row: Record<string, { value: string | null; source: "a" | "b" | "both" | null }> = {};
    for (const col of columns) {
      const valA = pair.rowA && col.colA ? (pair.rowA[col.colA] ?? null) : null;
      const valB = pair.rowB && col.colB ? (pair.rowB[col.colB] ?? null) : null;

      if (valA != null && valB != null) {
        row[col.canonical] = { value: valA, source: valA === valB ? "both" : "a" };
      } else if (valA != null) {
        row[col.canonical] = { value: valA, source: "a" };
      } else if (valB != null) {
        row[col.canonical] = { value: valB, source: "b" };
      } else {
        row[col.canonical] = { value: null, source: null };
      }
    }
    return { row, hasA: pair.rowA != null, hasB: pair.rowB != null };
  });

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-2 py-2 text-left whitespace-nowrap w-8">
                <span className="text-[9px] text-muted-foreground">Src</span>
              </th>
              {columns.map((col) => (
                <th
                  key={col.canonical}
                  className={`px-3 py-2 text-left whitespace-nowrap ${col.isJoinKey ? "bg-primary/[0.06]" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-medium text-foreground">{col.canonical}</span>
                    {col.isJoinKey && (
                      <Badge variant="default" className="text-[8px] px-1 py-0 h-3.5">KEY</Badge>
                    )}
                  </div>
                  {col.from !== "both" && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${col.from === "a_only" ? "bg-blue-400" : "bg-amber-400"}`} />
                      <span className="text-[9px] text-muted-foreground">
                        {col.from === "a_only" ? entityAName : entityBName} only
                      </span>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mergedRows.map((mr, i) => (
              <tr key={i} className="border-b border-border/30 last:border-b-0">
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-0.5">
                    {mr.hasA && <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />}
                    {mr.hasB && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />}
                  </div>
                </td>
                {columns.map((col) => {
                  const cell = mr.row[col.canonical];
                  return (
                    <td
                      key={col.canonical}
                      className={`px-3 py-1.5 whitespace-nowrap max-w-[150px] truncate ${col.isJoinKey ? "bg-primary/[0.02]" : ""}`}
                      title={cell?.value ?? ""}
                    >
                      {cell?.value != null ? (
                        <span className="font-mono">{cell.value}</span>
                      ) : (
                        <span className="text-muted-foreground/30 italic">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 bg-muted/10 border-t border-border text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
        <span>{columns.length} canonical columns · {mergedRows.length} merged rows</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
          {entityAName}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          {entityBName}
        </span>
        {joinCols.length > 0 ? (
          <span>Merged on: {joinCols.map((c) => c.canonical).join(", ")}</span>
        ) : (
          <span className="italic">No join keys selected. Select keys in the Schema tab to merge rows.</span>
        )}
      </div>
    </div>
  );
}
