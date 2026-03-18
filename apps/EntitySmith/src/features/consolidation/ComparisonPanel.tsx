import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, GitMerge, Link2, GitBranch, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MergeWizard } from "./MergeWizard";
import { LinkDialog } from "./LinkDialog";
import { SubtypeDialog } from "./SubtypeDialog";
import type {
  AttributeAlignment,
  ConsolidationDecision,
  EntityComparisonData,
  EntitySimilarityPair,
} from "@/types";

interface ComparisonPanelProps {
  pair: EntitySimilarityPair;
  onClose: () => void;
  onMerge: (
    canonicalName: string,
    entityASourceId: string,
    entityAName: string,
    entityBSourceId: string,
    entityBName: string,
    attributeMapping: Record<string, unknown>,
  ) => Promise<ConsolidationDecision>;
  onLink: (
    entityASourceId: string,
    entityAName: string,
    entityBSourceId: string,
    entityBName: string,
    predicate: string,
    reversed: boolean,
  ) => Promise<ConsolidationDecision>;
  onSubtype: (
    parentSourceId: string,
    parentEntityName: string,
    childSourceId: string,
    childEntityName: string,
  ) => Promise<ConsolidationDecision>;
  onKeepSeparate: (
    entityASourceId: string,
    entityAName: string,
    entityBSourceId: string,
    entityBName: string,
  ) => Promise<ConsolidationDecision>;
}

export function ComparisonPanel({
  pair,
  onClose,
  onMerge,
  onLink,
  onSubtype,
  onKeepSeparate,
}: ComparisonPanelProps) {
  const [comparison, setComparison] = useState<EntityComparisonData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMerge, setShowMerge] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [showSubtype, setShowSubtype] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    invoke<EntityComparisonData>("get_entity_comparison", {
      entityASourceId: pair.entityASourceId,
      entityAName: pair.entityAName,
      entityBSourceId: pair.entityBSourceId,
      entityBName: pair.entityBName,
    })
      .then(setComparison)
      .catch((e) => setError(String(e)))
      .finally(() => setIsLoading(false));
  }, [pair]);

  const handleKeepSeparate = useCallback(async () => {
    await onKeepSeparate(
      pair.entityASourceId,
      pair.entityAName,
      pair.entityBSourceId,
      pair.entityBName,
    );
    onClose();
  }, [pair, onKeepSeparate, onClose]);

  const handleMergeComplete = useCallback(async () => {
    setShowMerge(false);
    onClose();
  }, [onClose]);

  const handleLinkComplete = useCallback(async () => {
    setShowLink(false);
    onClose();
  }, [onClose]);

  const handleSubtypeComplete = useCallback(async () => {
    setShowSubtype(false);
    onClose();
  }, [onClose]);

  const pct = Math.round(pair.similarityScore * 100);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-x-0 top-1/2 z-50 mx-auto w-full max-w-[900px] -translate-y-1/2 rounded-lg border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <GitMerge size={16} className="text-primary" />
            <h2 className="text-sm font-semibold">
              Compare: {pair.entityAName}
              <span className="text-muted-foreground mx-2">↔</span>
              {pair.entityBName}
            </h2>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            Loading comparison…
          </div>
        )}

        {error && (
          <div className="px-5 py-4 text-sm text-destructive">{error}</div>
        )}

        {comparison && (
          <ScrollArea className="max-h-[70vh]">
            <div className="p-5">
              {/* Entity headers */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-md border border-border p-3">
                  <div className="font-medium text-sm">{comparison.entityA.profile.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {comparison.entityA.profile.rowCount.toLocaleString()} rows •{" "}
                    {comparison.entityA.attributes.length} columns
                  </div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="font-medium text-sm">{comparison.entityB.profile.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {comparison.entityB.profile.rowCount.toLocaleString()} rows •{" "}
                    {comparison.entityB.attributes.length} columns
                  </div>
                </div>
              </div>

              {/* Attribute alignment */}
              <div className="rounded-md border border-border overflow-hidden mb-4">
                <div className="grid grid-cols-[1fr_60px_1fr] gap-0 bg-muted/30 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground border-b border-border">
                  <span>Source A Column</span>
                  <span className="text-center">Match</span>
                  <span>Source B Column</span>
                </div>
                {comparison.attributeAlignments.map((alignment, i) => (
                  <AlignmentRow key={i} alignment={alignment} />
                ))}
              </div>

              {/* Similarity score */}
              <div className="flex items-center gap-3 rounded-md bg-muted/30 px-4 py-2.5 mb-4">
                <span className="text-xs text-muted-foreground">Similarity:</span>
                <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-sm font-semibold tabular-nums">{pct}%</span>
                {comparison.scoringDetails && (
                  <span className="text-[10px] text-muted-foreground ml-2">
                    {Object.entries(comparison.scoringDetails)
                      .filter(([, v]) => typeof v === "number")
                      .map(([k, v]) => `${k}: ${(v as number).toFixed(2)}`)
                      .join(" • ")}
                  </span>
                )}
              </div>

              <Separator className="my-4" />

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => setShowMerge(true)}>
                  <GitMerge size={14} className="mr-1.5" />
                  Merge
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowLink(true)}>
                  <Link2 size={14} className="mr-1.5" />
                  Link
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowSubtype(true)}>
                  <GitBranch size={14} className="mr-1.5" />
                  Subtype
                </Button>
                <div className="flex-1" />
                <Button size="sm" variant="ghost" onClick={handleKeepSeparate}>
                  <Ban size={14} className="mr-1.5" />
                  Keep Separate
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Sub-dialogs */}
      {showMerge && comparison && (
        <MergeWizard
          pair={pair}
          comparison={comparison}
          onMerge={onMerge}
          onComplete={handleMergeComplete}
          onCancel={() => setShowMerge(false)}
        />
      )}
      {showLink && (
        <LinkDialog
          pair={pair}
          onLink={onLink}
          onComplete={handleLinkComplete}
          onCancel={() => setShowLink(false)}
        />
      )}
      {showSubtype && (
        <SubtypeDialog
          pair={pair}
          onSubtype={onSubtype}
          onComplete={handleSubtypeComplete}
          onCancel={() => setShowSubtype(false)}
        />
      )}
    </>
  );
}

function AlignmentRow({ alignment }: { alignment: AttributeAlignment }) {
  const isExact = alignment.matchType === "exact";
  const isInferred = alignment.matchType === "inferred";
  const isUnmatchedA = alignment.matchType === "unmatched_a";
  const isUnmatchedB = alignment.matchType === "unmatched_b";

  return (
    <div className="grid grid-cols-[1fr_60px_1fr] gap-0 border-b border-border/40 px-3 py-1.5 text-sm last:border-b-0">
      {/* Column A */}
      <div className={`flex items-center gap-1.5 ${isUnmatchedB ? "opacity-30" : ""}`}>
        {alignment.sourceAColumn && (
          <>
            <span className="font-mono text-xs">{alignment.sourceAColumn}</span>
            {alignment.sourceAType && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                {alignment.sourceAType}
              </Badge>
            )}
          </>
        )}
      </div>

      {/* Arrow */}
      <div className="flex items-center justify-center">
        {(isExact || isInferred) && (
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
        )}
      </div>

      {/* Column B */}
      <div className={`flex items-center gap-1.5 ${isUnmatchedA ? "opacity-30" : ""}`}>
        {alignment.sourceBColumn && (
          <>
            <span className="font-mono text-xs">{alignment.sourceBColumn}</span>
            {alignment.sourceBType && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                {alignment.sourceBType}
              </Badge>
            )}
          </>
        )}
      </div>
    </div>
  );
}
