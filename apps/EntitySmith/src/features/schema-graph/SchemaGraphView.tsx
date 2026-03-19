import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SchemaGraphCanvas } from "./SchemaGraphCanvas";
import { useSchemaGraph } from "@/hooks/useSchemaGraph";
import type { EntityTypeWithBindings } from "@/types";

interface SchemaGraphViewProps {
  projectId: string;
  selectedEntityTypeId: string | null;
  onEntityTypeSelect: (et: EntityTypeWithBindings | null) => void;
}

export function SchemaGraphView({
  projectId: _projectId,
  selectedEntityTypeId,
  onEntityTypeSelect,
}: SchemaGraphViewProps) {
  const {
    schemaGraph,
    isLoading,
    loadSchemaGraph,
    addRelationship,
    updateRelationship,
    deleteRelationship,
  } = useSchemaGraph();

  useEffect(() => {
    loadSchemaGraph();
  }, [loadSchemaGraph]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={loadSchemaGraph}
              disabled={isLoading}
            >
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Reload the schema graph from the project file.</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {schemaGraph ? (
          <SchemaGraphCanvas
            graph={schemaGraph}
            selectedEntityTypeId={selectedEntityTypeId}
            onEntityTypeSelect={onEntityTypeSelect}
            onAddRelationship={async (src, tgt, pred) => {
              await addRelationship(src, tgt, pred);
            }}
            onUpdateRelationship={updateRelationship}
            onDeleteRelationship={deleteRelationship}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground">Loading…</p>
          </div>
        )}
      </div>
    </div>
  );
}
