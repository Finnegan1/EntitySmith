import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, ArrowDown } from "lucide-react";
import type { EntitySimilarityPair, ConsolidationDecision } from "@/types";

interface SubtypeDialogProps {
  pair: EntitySimilarityPair;
  onSubtype: (
    parentSourceId: string,
    parentEntityName: string,
    childSourceId: string,
    childEntityName: string,
  ) => Promise<ConsolidationDecision>;
  onComplete: () => void;
  onCancel: () => void;
}

export function SubtypeDialog({
  pair,
  onSubtype,
  onComplete,
  onCancel,
}: SubtypeDialogProps) {
  // false = A is parent, B is child; true = B is parent, A is child
  const [bIsParent, setBIsParent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parentName = bIsParent ? pair.entityBName : pair.entityAName;
  const childName = bIsParent ? pair.entityAName : pair.entityBName;

  const handleConfirm = useCallback(async () => {
    setIsSubmitting(true);
    try {
      if (bIsParent) {
        await onSubtype(
          pair.entityBSourceId,
          pair.entityBName,
          pair.entityASourceId,
          pair.entityAName,
        );
      } else {
        await onSubtype(
          pair.entityASourceId,
          pair.entityAName,
          pair.entityBSourceId,
          pair.entityBName,
        );
      }
      onComplete();
    } catch {
      // error handled upstream
    } finally {
      setIsSubmitting(false);
    }
  }, [bIsParent, pair, onSubtype, onComplete]);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onCancel} />
      <div className="fixed inset-x-0 top-1/2 z-[60] mx-auto w-full max-w-[420px] -translate-y-1/2 rounded-lg border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Subtype Relationship</h2>
          <button onClick={onCancel} className="rounded p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            Creates an <code className="text-[10px] bg-muted px-1 rounded">rdfs:subClassOf</code> relationship. The child entity type is a specialization of the parent.
          </p>

          {/* Direction preview */}
          <div className="flex flex-col items-center gap-1 rounded-md bg-muted/30 px-4 py-3">
            <span className="text-sm font-medium">{parentName}</span>
            <ArrowDown size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">{childName}</span>
            <span className="text-[10px] text-muted-foreground mt-1">
              {childName} rdfs:subClassOf {parentName}
            </span>
          </div>

          {/* Direction selection */}
          <div className="flex gap-2">
            <button
              className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                !bIsParent
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setBIsParent(false)}
            >
              {pair.entityAName} is parent
            </button>
            <button
              className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                bIsParent
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setBIsParent(true)}
            >
              {pair.entityBName} is parent
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create Subtype"}
          </Button>
        </div>
      </div>
    </>
  );
}
