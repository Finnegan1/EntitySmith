import { useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConsolidation } from "@/hooks/useConsolidation";
import { SimilarityPairsView } from "./SimilarityPairsView";
import { DecisionsLogView } from "./DecisionsLogView";
import { AttributeMappingEditor } from "./AttributeMappingEditor";
import { ComparisonPanel } from "./ComparisonPanel";
import type { EntitySimilarityPair, SchemaGraph } from "@/types";

type Tab = "pairs" | "decisions" | "mappings";

interface ConsolidationViewProps {
  schemaGraph: SchemaGraph | null;
}

export function ConsolidationView({ schemaGraph }: ConsolidationViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("pairs");
  const [comparePair, setComparePair] = useState<EntitySimilarityPair | null>(null);
  const consolidation = useConsolidation();

  const handleCompare = (pair: EntitySimilarityPair) => {
    setComparePair(pair);
  };

  const handleCloseComparison = () => {
    setComparePair(null);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <TabButton
            active={activeTab === "pairs"}
            onClick={() => setActiveTab("pairs")}
            label="Similar Pairs"
            count={consolidation.pendingCount}
          />
          <TabButton
            active={activeTab === "decisions"}
            onClick={() => setActiveTab("decisions")}
            label="Decisions"
            count={consolidation.decisions.length}
          />
          <TabButton
            active={activeTab === "mappings"}
            onClick={() => setActiveTab("mappings")}
            label="Attr Mappings"
          />
        </div>

        <div className="flex-1" />

        {activeTab === "pairs" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={consolidation.computeSimilarities}
                disabled={consolidation.isComputing}
              >
                {consolidation.isComputing ? (
                  <RotateCcw size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <Sparkles size={14} className="mr-1.5" />
                )}
                {consolidation.isComputing ? "Computing…" : "Compute Similarities"}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Analyze all source entities for potential matches
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Error banner */}
      {consolidation.error && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {consolidation.error}
          <button
            className="ml-auto text-xs underline"
            onClick={() => {}}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "pairs" && (
          <SimilarityPairsView
            pairs={consolidation.similarityPairs}
            isLoading={consolidation.isLoading || consolidation.isComputing}
            onCompare={handleCompare}
          />
        )}
        {activeTab === "decisions" && (
          <DecisionsLogView decisions={consolidation.decisions} />
        )}
        {activeTab === "mappings" && (
          <AttributeMappingEditor schemaGraph={schemaGraph} />
        )}
      </div>

      {/* Comparison dialog */}
      {comparePair && (
        <ComparisonPanel
          pair={comparePair}
          onClose={handleCloseComparison}
          onMerge={consolidation.executeMerge}
          onLink={consolidation.executeLink}
          onSubtype={consolidation.executeSubtype}
          onKeepSeparate={consolidation.keepSeparate}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
    >
      {label}
      {count != null && count > 0 && (
        <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">
          {count}
        </Badge>
      )}
    </button>
  );
}
