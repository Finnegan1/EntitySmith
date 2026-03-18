import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Check, X } from "lucide-react";
import type {
  EntityComparisonData,
  EntitySimilarityPair,
  ConsolidationDecision,
} from "@/types";

interface MergeWizardProps {
  pair: EntitySimilarityPair;
  comparison: EntityComparisonData;
  onMerge: (
    canonicalName: string,
    entityASourceId: string,
    entityAName: string,
    entityBSourceId: string,
    entityBName: string,
    attributeMapping: Record<string, unknown>,
  ) => Promise<ConsolidationDecision>;
  onComplete: () => void;
  onCancel: () => void;
}

interface MappingRow {
  sourceAColumn: string | null;
  sourceBColumn: string | null;
  canonicalName: string;
  included: boolean;
  matchType: string;
}

export function MergeWizard({
  pair,
  comparison,
  onMerge,
  onComplete,
  onCancel,
}: MergeWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [canonicalName, setCanonicalName] = useState(pair.entityAName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [rows, setRows] = useState<MappingRow[]>(() =>
    comparison.attributeAlignments.map((a) => ({
      sourceAColumn: a.sourceAColumn ?? null,
      sourceBColumn: a.sourceBColumn ?? null,
      canonicalName:
        a.sourceAColumn ?? a.sourceBColumn ?? "",
      included: true,
      matchType: a.matchType,
    })),
  );

  const updateRow = useCallback((index: number, patch: Partial<MappingRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  const includedCount = useMemo(() => rows.filter((r) => r.included).length, [rows]);

  const handleConfirm = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const attributeMapping: Record<string, unknown> = {};
      for (const row of rows) {
        if (!row.included) continue;
        attributeMapping[row.canonicalName] = {
          sourceAColumn: row.sourceAColumn,
          sourceBColumn: row.sourceBColumn,
        };
      }
      await onMerge(
        canonicalName,
        pair.entityASourceId,
        pair.entityAName,
        pair.entityBSourceId,
        pair.entityBName,
        attributeMapping,
      );
      onComplete();
    } catch {
      // error handled upstream
    } finally {
      setIsSubmitting(false);
    }
  }, [canonicalName, rows, pair, onMerge, onComplete]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onCancel} />

      {/* Dialog */}
      <div className="fixed inset-x-0 top-1/2 z-[60] mx-auto w-full max-w-[700px] -translate-y-1/2 rounded-lg border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">
            Merge Wizard — Step {step} of 2
          </h2>
          <button onClick={onCancel} className="rounded p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        {step === 1 && (
          <ScrollArea className="max-h-[60vh]">
            <div className="p-5 space-y-4">
              {/* Canonical name */}
              <div className="space-y-1.5">
                <Label className="text-xs">Canonical Type Name</Label>
                <Input
                  value={canonicalName}
                  onChange={(e) => setCanonicalName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              <Separator />

              {/* Attribute mapping table */}
              <div className="rounded-md border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_1fr_40px] gap-0 bg-muted/30 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground border-b border-border">
                  <span>Source A Column</span>
                  <span className="text-center">Canonical Name</span>
                  <span>Source B Column</span>
                  <span className="text-center">Use</span>
                </div>

                {rows.map((row, i) => (
                  <div
                    key={i}
                    className={`grid grid-cols-[1fr_1fr_1fr_40px] gap-0 items-center border-b border-border/40 px-3 py-1.5 text-sm last:border-b-0 ${
                      !row.included ? "opacity-40" : ""
                    }`}
                  >
                    {/* Source A */}
                    <div className="flex items-center gap-1.5">
                      {row.sourceAColumn ? (
                        <span className="font-mono text-xs">{row.sourceAColumn}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </div>

                    {/* Canonical name input */}
                    <div className="px-1">
                      <Input
                        value={row.canonicalName}
                        onChange={(e) =>
                          updateRow(i, { canonicalName: e.target.value })
                        }
                        className="h-6 text-xs font-mono px-1.5"
                        disabled={!row.included}
                      />
                    </div>

                    {/* Source B */}
                    <div className="flex items-center gap-1.5">
                      {row.sourceBColumn ? (
                        <span className="font-mono text-xs">{row.sourceBColumn}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </div>

                    {/* Include toggle */}
                    <div className="flex justify-center">
                      <button
                        className={`h-5 w-5 rounded border flex items-center justify-center ${
                          row.included
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        }`}
                        onClick={() => updateRow(i, { included: !row.included })}
                      >
                        {row.included && <Check size={12} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        )}

        {step === 2 && (
          <div className="p-5 space-y-3">
            <h3 className="text-sm font-medium">Confirm Merge</h3>
            <div className="rounded-md border border-border p-4 space-y-2 text-sm">
              <p>
                Create canonical type{" "}
                <Badge variant="secondary" className="font-mono text-xs">
                  {canonicalName}
                </Badge>{" "}
                with 2 source bindings.
              </p>
              <p>
                <strong>{includedCount}</strong> attribute{includedCount !== 1 && "s"} mapped.
              </p>
              <p className="text-xs text-muted-foreground">
                Existing relationships referencing either source entity will be remapped
                to the new canonical type.
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          {step === 1 ? (
            <>
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => setStep(2)}
                disabled={!canonicalName.trim()}
              >
                Confirm Merge
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStep(1)}
              >
                <ArrowLeft size={14} className="mr-1.5" />
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Merging…" : "Confirm"}
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
