import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClipboardList, GitMerge, Link2, GitBranch, Ban } from "lucide-react";
import type { ConsolidationDecision, ConsolidationDecisionType } from "@/types";

interface DecisionsLogViewProps {
  decisions: ConsolidationDecision[];
}

const DECISION_META: Record<
  ConsolidationDecisionType,
  { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  merge: {
    label: "Merge",
    icon: <GitMerge size={12} />,
    variant: "default",
  },
  link: {
    label: "Link",
    icon: <Link2 size={12} />,
    variant: "secondary",
  },
  subtype: {
    label: "Subtype",
    icon: <GitBranch size={12} />,
    variant: "secondary",
  },
  keep_separate: {
    label: "Keep Separate",
    icon: <Ban size={12} />,
    variant: "outline",
  },
};

export function DecisionsLogView({ decisions }: DecisionsLogViewProps) {
  if (decisions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <ClipboardList size={40} strokeWidth={1} />
        <p className="text-sm">No decisions yet.</p>
        <p className="text-xs">
          Compare similar entity pairs and choose how to consolidate them.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Column headers */}
      <div className="grid grid-cols-[100px_1fr_auto_1fr_140px] items-center gap-2 border-b border-border bg-muted/30 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Type</span>
        <span>Entity A</span>
        <span />
        <span>Entity B</span>
        <span className="text-right">Date</span>
      </div>

      <ScrollArea className="flex-1">
        {decisions.map((d) => (
          <DecisionRow key={d.id} decision={d} />
        ))}
      </ScrollArea>
    </div>
  );
}

function DecisionRow({ decision }: { decision: ConsolidationDecision }) {
  const meta = DECISION_META[decision.decisionType];
  const date = new Date(decision.createdAt);
  const dateStr = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="grid grid-cols-[100px_1fr_auto_1fr_140px] items-center gap-2 border-b border-border/50 px-4 py-2 hover:bg-accent/30 transition-colors">
      {/* Type badge */}
      <div>
        <Badge variant={meta.variant} className="text-[10px] gap-1">
          {meta.icon}
          {meta.label}
        </Badge>
      </div>

      {/* Entity A */}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{decision.entityAName}</div>
        <div className="truncate text-xs text-muted-foreground">
          {decision.entityASourceId.slice(0, 8)}…
        </div>
      </div>

      {/* Arrow */}
      <span className="text-muted-foreground text-xs">↔</span>

      {/* Entity B */}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{decision.entityBName}</div>
        <div className="truncate text-xs text-muted-foreground">
          {decision.entityBSourceId.slice(0, 8)}…
        </div>
      </div>

      {/* Date */}
      <div className="text-right text-xs text-muted-foreground">{dateStr}</div>
    </div>
  );
}
