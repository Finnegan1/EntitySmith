import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Boxes,
  ChevronRight,
  Database,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSchemaGraph } from "@/hooks/useSchemaGraph";
import { useConsolidation } from "@/hooks/useConsolidation";
import { EntityEditorView } from "./EntityEditorView";
import type {
  EntityTypeWithBindings,
  SchemaGraph,
  SourceEntitySummary,
} from "@/types";

interface EntitiesViewProps {
  schemaGraph: SchemaGraph | null;
}

export function EntitiesView({ schemaGraph: _externalGraph }: EntitiesViewProps) {
  const {
    schemaGraph,
    sourceEntities,
    isLoading,
    createEntityType,
    bindSourceEntity,
  } = useSchemaGraph();

  const {
    isComputing,
    computeSimilarities,
  } = useConsolidation();

  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [createFrom, setCreateFrom] = useState<SourceEntitySummary | null>(null);

  const entityTypes = schemaGraph?.entityTypes ?? [];
  const unboundEntities = sourceEntities.filter((e) => !e.boundEntityTypeId);

  // Find the entity type being edited
  const editingEntity = editingEntityId
    ? entityTypes.find((et) => et.entityType.id === editingEntityId)
    : null;

  // If editing, show the editor
  if (editingEntity) {
    return (
      <EntityEditorView
        entityType={editingEntity}
        onBack={() => setEditingEntityId(null)}
      />
    );
  }

  const totalRows = (et: EntityTypeWithBindings): number => {
    let total = 0;
    for (const binding of et.bindings) {
      const se = sourceEntities.find(
        (e) => e.sourceId === binding.sourceId && e.entityName === binding.entityName,
      );
      if (se) total += se.rowCount;
    }
    return total;
  };

  if (sourceEntities.length === 0 && entityTypes.length === 0 && !isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Database size={40} strokeWidth={1} />
        <p className="text-sm">No source tables available</p>
        <p className="text-xs max-w-xs text-center">
          Register data sources first, then return here to create entity types from discovered tables.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">
          {entityTypes.length} entity type{entityTypes.length !== 1 && "s"}
        </span>
        <span className="text-xs text-muted-foreground">
          {unboundEntities.length} unbound table{unboundEntities.length !== 1 && "s"}
        </span>
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={computeSimilarities}
              disabled={isComputing}
            >
              {isComputing ? (
                <RotateCcw size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              {isComputing ? "Analyzing…" : "Find Similar"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Scan source tables for overlapping column structures
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Entity Types */}
          {entityTypes.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                Entity Types
              </p>
              <div className="space-y-2">
                {entityTypes.map((et) => (
                  <button
                    key={et.entityType.id}
                    onClick={() => setEditingEntityId(et.entityType.id)}
                    className="flex w-full items-center gap-3 rounded-md border border-border px-4 py-3 text-left hover:bg-muted/30 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{et.entityType.name}</span>
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {et.bindings.length} dataset{et.bindings.length !== 1 && "s"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        {et.bindings.slice(0, 3).map((b) => (
                          <span key={b.id} className="font-mono">{b.entityName}</span>
                        ))}
                        {et.bindings.length > 3 && (
                          <span>+{et.bindings.length - 3} more</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {totalRows(et).toLocaleString()} rows
                    </span>
                    <ChevronRight size={16} className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {entityTypes.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Boxes size={36} strokeWidth={1} />
              <p className="text-sm">No entity types defined yet</p>
              <p className="text-xs">
                Pick a source table below to create your first canonical entity type.
              </p>
            </div>
          )}

          {entityTypes.length > 0 && unboundEntities.length > 0 && <Separator />}

          {/* Unbound Source Tables */}
          {unboundEntities.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                Unbound Source Tables
              </p>
              <div className="rounded-md border border-border overflow-hidden">
                {unboundEntities.map((entity, i) => (
                  <div
                    key={`${entity.sourceId}:${entity.entityName}`}
                    className={`flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30 transition-colors ${
                      i < unboundEntities.length - 1 ? "border-b border-border/50" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{entity.entityName}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {entity.sourceName}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {entity.rowCount.toLocaleString()} rows
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 gap-1 px-2 text-[11px] shrink-0"
                      onClick={() => setCreateFrom(entity)}
                    >
                      <Plus size={10} />
                      Create Entity
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unboundEntities.length === 0 && entityTypes.length > 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              All source tables have been assigned to entity types.
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Create Entity Dialog */}
      {createFrom && (
        <CreateEntityDialog
          startingEntity={createFrom}
          onConfirm={async (name, additionalBindings) => {
            const et = await createEntityType(name);
            await bindSourceEntity(et.id, createFrom.sourceId, createFrom.entityName);
            // Add the starting dataset as step 0 (base) in the join plan
            await invoke("add_join_step", {
              entityTypeId: et.id,
              stepOrder: 0,
              sourceId: createFrom.sourceId,
              entityName: createFrom.entityName,
              joinType: "left",
            });
            for (const binding of additionalBindings) {
              await bindSourceEntity(et.id, binding.sourceId, binding.entityName);
            }
            setCreateFrom(null);
            // Navigate to the new entity editor
            setEditingEntityId(et.id);
          }}
          onCancel={() => setCreateFrom(null)}
        />
      )}

    </div>
  );
}

// ── Create Entity Dialog ──────────────────────────────────────────────────────

function CreateEntityDialog({
  startingEntity,
  onConfirm,
  onCancel,
}: {
  startingEntity: SourceEntitySummary;
  onConfirm: (name: string, additionalBindings: SourceEntitySummary[]) => Promise<void>;
  onCancel: () => void;
}) {
  const suggestedName = toTitleCase(startingEntity.entityName);
  const [name, setName] = useState(suggestedName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      // Create with just the starting entity — additional datasets added in the editor
      await onConfirm(name.trim(), []);
    } catch (e) {
      setError(String(e));
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onCancel} />
      <div className="fixed inset-x-0 top-1/2 z-50 mx-auto w-full max-w-[420px] -translate-y-1/2 rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Create Entity Type</h2>
          <button onClick={onCancel} className="rounded p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Starting from
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{startingEntity.entityName}</span>
              <span className="text-xs text-muted-foreground">{startingEntity.sourceName}</span>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground tabular-nums">
                {startingEntity.rowCount.toLocaleString()} rows
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Entity Type Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
              }}
            />
            <p className="text-[10px] text-muted-foreground">
              You can add more datasets and configure joins in the entity editor.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!name.trim() || isSubmitting}
          >
            {isSubmitting ? "Creating…" : "Create & Open Editor"}
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTitleCase(s: string): string {
  const stripped = s.replace(/s$/, "");
  return stripped
    .split(/[_\-\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}
