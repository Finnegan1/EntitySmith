import { useState } from "react";
import { ArrowRight, Eye, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EntitySimilarityPair } from "@/types";

type StatusFilter = "all" | "pending" | "resolved";

interface SimilarityPairsViewProps {
  pairs: EntitySimilarityPair[];
  isLoading: boolean;
  onCompare: (pair: EntitySimilarityPair) => void;
}

export function SimilarityPairsView({
  pairs,
  isLoading,
  onCompare,
}: SimilarityPairsViewProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filteredPairs = pairs.filter((p) => {
    if (statusFilter === "all") return true;
    return p.status === statusFilter;
  });

  if (pairs.length === 0 && !isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Layers size={40} strokeWidth={1} />
        <p className="text-sm">No similarity data yet.</p>
        <p className="text-xs">
          Click <strong>Compute Similarities</strong> to analyze source entities for potential matches.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
        <span className="text-xs text-muted-foreground">Status:</span>
        {(["all", "pending", "resolved"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded px-2 py-0.5 text-xs ${
              statusFilter === s
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {filteredPairs.length} pair{filteredPairs.length !== 1 && "s"}
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_1fr_80px_80px_70px] items-center gap-2 border-b border-border bg-muted/30 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Entity A</span>
        <span />
        <span>Entity B</span>
        <span className="text-center">Score</span>
        <span className="text-center">Status</span>
        <span />
      </div>

      {/* Pairs list */}
      <ScrollArea className="flex-1">
        {isLoading && pairs.length === 0 && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Computing similarities…
          </div>
        )}
        {filteredPairs.map((pair) => (
          <PairRow key={pair.id} pair={pair} onCompare={onCompare} />
        ))}
      </ScrollArea>
    </div>
  );
}

function PairRow({
  pair,
  onCompare,
}: {
  pair: EntitySimilarityPair;
  onCompare: (pair: EntitySimilarityPair) => void;
}) {
  const pct = Math.round(pair.similarityScore * 100);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr_80px_80px_70px] items-center gap-2 border-b border-border/50 px-4 py-2 hover:bg-accent/30 transition-colors">
      {/* Entity A */}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{pair.entityAName}</div>
        <div className="truncate text-xs text-muted-foreground">
          {pair.entityASourceId.slice(0, 8)}…
        </div>
      </div>

      {/* Arrow */}
      <ArrowRight size={14} className="text-muted-foreground mx-1" />

      {/* Entity B */}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{pair.entityBName}</div>
        <div className="truncate text-xs text-muted-foreground">
          {pair.entityBSourceId.slice(0, 8)}…
        </div>
      </div>

      {/* Score */}
      <div className="flex items-center justify-center gap-1.5">
        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-medium tabular-nums">{pct}%</span>
      </div>

      {/* Status */}
      <div className="flex justify-center">
        <Badge
          variant={pair.status === "pending" ? "outline" : "secondary"}
          className="text-[10px]"
        >
          {pair.status}
        </Badge>
      </div>

      {/* Compare button */}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onCompare(pair)}
        >
          <Eye size={12} className="mr-1" />
          Compare
        </Button>
      </div>
    </div>
  );
}
