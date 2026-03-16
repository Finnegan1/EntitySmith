import { useEffect, useState } from "react";
import { GitFork, List, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SchemaGraphCanvas } from "./SchemaGraphCanvas";
import { EntityCatalogView } from "./EntityCatalogView";
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
    sourceEntities,
    isLoading,
    loadSchemaGraph,
    createEntityType,
    addRelationship,
    deleteRelationship,
    bindSourceEntity,
    unbindSourceEntity,
  } = useSchemaGraph();

  const [activeTab, setActiveTab] = useState<"canvas" | "catalog">("canvas");

  useEffect(() => {
    loadSchemaGraph();
  }, [loadSchemaGraph]);

  const unboundCount = sourceEntities.filter((e) => !e.boundEntityTypeId).length;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="flex rounded-md border border-border overflow-hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setActiveTab("canvas")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors ${
                  activeTab === "canvas"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <GitFork size={12} />
                Graph
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Visual canvas showing canonical entity types as nodes and their relationships as edges. Drag from one node's handle to another to create a relationship.</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setActiveTab("catalog")}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors ${
                  activeTab === "catalog"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <List size={12} />
                Catalog
                {unboundCount > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="rounded-full bg-amber-500 text-white text-[9px] px-1 min-w-4 text-center leading-4">
                        {unboundCount}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>{unboundCount} source {unboundCount === 1 ? "entity" : "entities"} not yet bound to a canonical type — they won't appear in the graph or be included in exports until promoted.</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Table of all entities discovered across your registered sources. Bind each one to a canonical type to include it in the schema graph and exports.</p>
            </TooltipContent>
          </Tooltip>
        </div>

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
            <p>Reload the schema graph and source catalog from the project file.</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "canvas" ? (
          schemaGraph ? (
            <SchemaGraphCanvas
              graph={schemaGraph}
              selectedEntityTypeId={selectedEntityTypeId}
              onEntityTypeSelect={onEntityTypeSelect}
              onAddRelationship={async (src, tgt, pred) => {
                await addRelationship(src, tgt, pred);
              }}
              onDeleteRelationship={deleteRelationship}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-xs text-muted-foreground">Loading…</p>
            </div>
          )
        ) : (
          <div className="h-full overflow-auto">
            <EntityCatalogView
              sourceEntities={sourceEntities}
              schemaGraph={schemaGraph}
              selectedEntityTypeId={selectedEntityTypeId}
              onEntityTypeSelect={onEntityTypeSelect}
              onCreateEntityType={createEntityType}
              onBindSourceEntity={bindSourceEntity}
              onUnbindSourceEntity={unbindSourceEntity}
            />
          </div>
        )}
      </div>
    </div>
  );
}
