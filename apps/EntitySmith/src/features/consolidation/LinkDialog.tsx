import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, ArrowRight } from "lucide-react";
import type { EntitySimilarityPair, ConsolidationDecision } from "@/types";

interface LinkDialogProps {
  pair: EntitySimilarityPair;
  onLink: (
    entityASourceId: string,
    entityAName: string,
    entityBSourceId: string,
    entityBName: string,
    predicate: string,
    reversed: boolean,
  ) => Promise<ConsolidationDecision>;
  onComplete: () => void;
  onCancel: () => void;
}

export function LinkDialog({ pair, onLink, onComplete, onCancel }: LinkDialogProps) {
  const [predicate, setPredicate] = useState("ex:relatedTo");
  const [reversed, setReversed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (!predicate.trim()) return;
    setIsSubmitting(true);
    try {
      await onLink(
        pair.entityASourceId,
        pair.entityAName,
        pair.entityBSourceId,
        pair.entityBName,
        predicate,
        reversed,
      );
      onComplete();
    } catch {
      // error handled upstream
    } finally {
      setIsSubmitting(false);
    }
  }, [predicate, reversed, pair, onLink, onComplete]);

  const fromName = reversed ? pair.entityBName : pair.entityAName;
  const toName = reversed ? pair.entityAName : pair.entityBName;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onCancel} />
      <div className="fixed inset-x-0 top-1/2 z-[60] mx-auto w-full max-w-[480px] -translate-y-1/2 rounded-lg border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Link Entities</h2>
          <button onClick={onCancel} className="rounded p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Direction preview */}
          <div className="flex items-center justify-center gap-3 rounded-md bg-muted/30 px-4 py-3">
            <span className="text-sm font-medium">{fromName}</span>
            <ArrowRight size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium">{toName}</span>
          </div>

          {/* Predicate */}
          <div className="space-y-1.5">
            <Label className="text-xs">Relationship Predicate</Label>
            <Input
              value={predicate}
              onChange={(e) => setPredicate(e.target.value)}
              placeholder="ex:relatedTo"
              className="h-8 text-sm font-mono"
            />
          </div>

          {/* Direction toggle */}
          <div className="space-y-1.5">
            <Label className="text-xs">Direction</Label>
            <div className="flex gap-2">
              <button
                className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                  !reversed
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setReversed(false)}
              >
                {pair.entityAName} → {pair.entityBName}
              </button>
              <button
                className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                  reversed
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setReversed(true)}
              >
                {pair.entityBName} → {pair.entityAName}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!predicate.trim() || isSubmitting}
          >
            {isSubmitting ? "Linking…" : "Create Link"}
          </Button>
        </div>
      </div>
    </>
  );
}
