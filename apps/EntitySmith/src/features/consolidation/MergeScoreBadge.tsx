import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import type { EntityComparisonData } from "@/types";
import { computeMergeFactors } from "./SuggestionInspector";

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

interface MergeScoreBadgeProps {
  entityASourceId: string;
  entityAName: string;
  entityBSourceId: string;
  entityBName: string;
  /** When set, compare the merged entity type against the candidate */
  entityTypeId?: string;
}

export function MergeScoreBadge({
  entityASourceId,
  entityAName,
  entityBSourceId,
  entityBName,
  entityTypeId,
}: MergeScoreBadgeProps) {
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setScore(null);

    const load = entityTypeId
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

    load
      .then((data) => {
        const m = computeMergeFactors(
          data.attributeAlignments,
          data.entityA.attributes,
          data.entityB.attributes,
          data.scoringDetails,
        );
        setScore(m.composite);
      })
      .catch(() => setScore(null))
      .finally(() => setLoading(false));
  }, [entityASourceId, entityAName, entityBSourceId, entityBName, entityTypeId]);

  if (loading) {
    return (
      <div className="flex items-center gap-1 w-[52px] justify-end">
        <Loader2 size={10} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (score == null) {
    return (
      <span className="text-[10px] text-muted-foreground/50 tabular-nums w-[52px] text-right">
        —
      </span>
    );
  }

  const pct = Math.round(score * 100);

  return (
    <div className="flex items-center gap-1">
      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${scoreBarColor(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[10px] tabular-nums w-7 text-right font-medium ${scoreColor(score)}`}>
        {pct}%
      </span>
    </div>
  );
}
