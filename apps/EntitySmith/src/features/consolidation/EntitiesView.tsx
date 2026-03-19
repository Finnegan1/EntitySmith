import { useCallback, useState } from "react";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Unlink,
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
import { SuggestionInspector } from "./SuggestionInspector";
import type {
  EntityTypeWithBindings,
  SchemaGraph,
  SourceEntitySummary,
} from "@/types";

interface InspectTarget {
  entityASourceId: string;
  entityAName: string;
  entityASourceName?: string;
  entityBSourceId: string;
  entityBName: string;
  entityBSourceName?: string;
}

interface EntitiesViewProps {
  schemaGraph: SchemaGraph | null;
}

export function EntitiesView({ schemaGraph: _externalGraph }: EntitiesViewProps) {
  const {
    schemaGraph,
    sourceEntities,
    isLoading,
    createEntityType,
    deleteEntityType,
    bindSourceEntity,
    unbindSourceEntity,
  } = useSchemaGraph();

  const {
    similarityPairs,
    isComputing,
    computeSimilarities,
  } = useConsolidation();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createFrom, setCreateFrom] = useState<SourceEntitySummary | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [inspecting, setInspecting] = useState<InspectTarget | null>(null);

  const entityTypes = schemaGraph?.entityTypes ?? [];
  const unboundEntities = sourceEntities.filter((e) => !e.boundEntityTypeId);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Find suggestions for an entity type based on similarity pairs
  const getSuggestions = useCallback(
    (et: EntityTypeWithBindings): { entity: SourceEntitySummary; score: number }[] => {
      const boundNames = new Set(et.bindings.map((b) => `${b.sourceId}:${b.entityName}`));
      const suggestions: { entity: SourceEntitySummary; score: number }[] = [];

      for (const binding of et.bindings) {
        for (const pair of similarityPairs) {
          if (pair.status === "resolved") continue;
          let matchKey: string | null = null;
          let matchScore = 0;

          if (
            pair.entityASourceId === binding.sourceId &&
            pair.entityAName === binding.entityName
          ) {
            matchKey = `${pair.entityBSourceId}:${pair.entityBName}`;
            matchScore = pair.similarityScore;
          } else if (
            pair.entityBSourceId === binding.sourceId &&
            pair.entityBName === binding.entityName
          ) {
            matchKey = `${pair.entityASourceId}:${pair.entityAName}`;
            matchScore = pair.similarityScore;
          }

          if (matchKey && !boundNames.has(matchKey)) {
            const se = sourceEntities.find(
              (e) =>
                `${e.sourceId}:${e.entityName}` === matchKey && !e.boundEntityTypeId,
            );
            if (se && !suggestions.some((s) => `${s.entity.sourceId}:${s.entity.entityName}` === matchKey)) {
              suggestions.push({ entity: se, score: matchScore });
            }
          }
        }
      }

      return suggestions.sort((a, b) => b.score - a.score);
    },
    [similarityPairs, sourceEntities],
  );

  // Get similarity suggestions for a specific source entity (used in create dialog)
  const getSimilarTo = useCallback(
    (sourceId: string, entityName: string): { entity: SourceEntitySummary; score: number }[] => {
      const results: { entity: SourceEntitySummary; score: number }[] = [];

      for (const pair of similarityPairs) {
        if (pair.status === "resolved") continue;
        let targetSourceId: string | null = null;
        let targetName: string | null = null;
        let score = 0;

        if (pair.entityASourceId === sourceId && pair.entityAName === entityName) {
          targetSourceId = pair.entityBSourceId;
          targetName = pair.entityBName;
          score = pair.similarityScore;
        } else if (pair.entityBSourceId === sourceId && pair.entityBName === entityName) {
          targetSourceId = pair.entityASourceId;
          targetName = pair.entityAName;
          score = pair.similarityScore;
        }

        if (targetSourceId && targetName) {
          const se = sourceEntities.find(
            (e) => e.sourceId === targetSourceId && e.entityName === targetName && !e.boundEntityTypeId,
          );
          if (se) {
            results.push({ entity: se, score });
          }
        }
      }

      return results.sort((a, b) => b.score - a.score);
    },
    [similarityPairs, sourceEntities],
  );

  const totalRows = useCallback(
    (et: EntityTypeWithBindings): number => {
      let total = 0;
      for (const binding of et.bindings) {
        const se = sourceEntities.find(
          (e) => e.sourceId === binding.sourceId && e.entityName === binding.entityName,
        );
        if (se) total += se.rowCount;
      }
      return total;
    },
    [sourceEntities],
  );

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
            Scan source tables for overlapping column structures to find tables that may represent the same concept
          </TooltipContent>
        </Tooltip>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setShowNewDialog(true)}
        >
          <Plus size={12} />
          New
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Entity Types Section */}
          {entityTypes.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                Entity Types
              </p>
              <div className="space-y-2">
                {entityTypes.map((et) => (
                  <EntityTypeCard
                    key={et.entityType.id}
                    entityType={et}
                    isExpanded={expandedId === et.entityType.id}
                    onToggle={() => toggleExpand(et.entityType.id)}
                    totalRows={totalRows(et)}
                    suggestions={getSuggestions(et)}
                    sourceEntities={sourceEntities}
                    onBind={bindSourceEntity}
                    onUnbind={unbindSourceEntity}
                    onDelete={deleteEntityType}
                    onInspect={setInspecting}
                  />
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

          {/* Separator */}
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

      {/* Create Entity Dialog — triggered from a specific source table */}
      {createFrom && (
        <CreateEntityDialog
          startingEntity={createFrom}
          similarEntities={getSimilarTo(createFrom.sourceId, createFrom.entityName)}
          onConfirm={async (name, additionalBindings) => {
            const et = await createEntityType(name);
            await bindSourceEntity(et.id, createFrom.sourceId, createFrom.entityName);
            for (const binding of additionalBindings) {
              await bindSourceEntity(et.id, binding.sourceId, binding.entityName);
            }
            setCreateFrom(null);
          }}
          onCancel={() => setCreateFrom(null)}
          onInspect={setInspecting}
        />
      )}

      {/* New Entity Dialog — from toolbar, no pre-selected table */}
      {showNewDialog && (
        <NewEntityDialog
          unboundEntities={unboundEntities}
          onConfirm={async (name, selectedEntities) => {
            const et = await createEntityType(name);
            for (const se of selectedEntities) {
              await bindSourceEntity(et.id, se.sourceId, se.entityName);
            }
            setShowNewDialog(false);
          }}
          onCancel={() => setShowNewDialog(false)}
        />
      )}

      {/* Suggestion Inspector */}
      {inspecting && (
        <SuggestionInspector
          entityASourceId={inspecting.entityASourceId}
          entityAName={inspecting.entityAName}
          entityASourceName={inspecting.entityASourceName}
          entityBSourceId={inspecting.entityBSourceId}
          entityBName={inspecting.entityBName}
          entityBSourceName={inspecting.entityBSourceName}
          onClose={() => setInspecting(null)}
        />
      )}
    </div>
  );
}

// ── Entity Type Card ──────────────────────────────────────────────────────────

function EntityTypeCard({
  entityType: et,
  isExpanded,
  onToggle,
  totalRows,
  suggestions,
  sourceEntities,
  onBind,
  onUnbind,
  onDelete,
  onInspect,
}: {
  entityType: EntityTypeWithBindings;
  isExpanded: boolean;
  onToggle: () => void;
  totalRows: number;
  suggestions: { entity: SourceEntitySummary; score: number }[];
  sourceEntities: SourceEntitySummary[];
  onBind: (entityTypeId: string, sourceId: string, entityName: string) => Promise<unknown>;
  onUnbind: (entityTypeId: string, sourceId: string, entityName: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onInspect: (target: InspectTarget) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleAddBinding = async (se: SourceEntitySummary) => {
    setBusy(true);
    try {
      await onBind(et.entityType.id, se.sourceId, se.entityName);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveBinding = async (sourceId: string, entityName: string) => {
    setBusy(true);
    try {
      await onUnbind(et.entityType.id, sourceId, entityName);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await onDelete(et.entityType.id);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="rounded-md border border-border overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
        )}
        <span className="font-medium text-sm">{et.entityType.name}</span>
        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">
          {et.bindings.length} source{et.bindings.length !== 1 && "s"}
        </Badge>
        {suggestions.length > 0 && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/50 text-amber-600">
            {suggestions.length} suggestion{suggestions.length !== 1 && "s"}
          </Badge>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums">
          {totalRows.toLocaleString()} rows
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border bg-muted/10 px-3 py-3 space-y-3">
          {/* Bound sources */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
              Bound Sources
            </p>
            <div className="space-y-1">
              {et.bindings.map((binding) => {
                const se = sourceEntities.find(
                  (e) => e.sourceId === binding.sourceId && e.entityName === binding.entityName,
                );
                return (
                  <div
                    key={binding.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/40 group"
                  >
                    <span className="font-mono text-xs">{binding.entityName}</span>
                    <span className="text-xs text-muted-foreground">
                      {se?.sourceName ?? binding.sourceId.slice(0, 8)}
                    </span>
                    <div className="flex-1" />
                    {se && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {se.rowCount.toLocaleString()} rows
                      </span>
                    )}
                    {et.bindings.length > 1 && (
                      <button
                        onClick={() => handleRemoveBinding(binding.sourceId, binding.entityName)}
                        disabled={busy}
                        className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:text-destructive transition-all disabled:opacity-50"
                      >
                        <Unlink size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                Suggestions
              </p>
              <div className="space-y-1">
                {suggestions.map(({ entity: se, score }) => {
                  const pct = Math.round(score * 100);
                  return (
                    <div
                      key={`${se.sourceId}:${se.entityName}`}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                    >
                      <span className="font-mono text-xs">{se.entityName}</span>
                      <span className="text-xs text-muted-foreground">{se.sourceName}</span>
                      <div className="flex-1" />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {se.rowCount.toLocaleString()} rows
                      </span>
                      <div className="flex items-center gap-1">
                        <div className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">
                          {pct}%
                        </span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0 text-muted-foreground"
                            onClick={() => {
                              const binding = et.bindings[0];
                              if (!binding) return;
                              const boundSe = sourceEntities.find(
                                (e) => e.sourceId === binding.sourceId && e.entityName === binding.entityName,
                              );
                              onInspect({
                                entityASourceId: binding.sourceId,
                                entityAName: binding.entityName,
                                entityASourceName: boundSe?.sourceName,
                                entityBSourceId: se.sourceId,
                                entityBName: se.entityName,
                                entityBSourceName: se.sourceName,
                              });
                            }}
                          >
                            <Eye size={11} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">Inspect comparison</TooltipContent>
                      </Tooltip>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-5 px-1.5 text-[10px] gap-0.5"
                        onClick={() => handleAddBinding(se)}
                        disabled={busy}
                      >
                        <Plus size={9} />
                        Add
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1" />
            {confirmDelete ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-destructive">Delete "{et.entityType.name}"?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 px-2 text-[11px]"
                  onClick={handleDelete}
                  disabled={busy}
                >
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px] text-muted-foreground"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={11} className="mr-1" />
                Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create Entity Dialog ──────────────────────────────────────────────────────

function CreateEntityDialog({
  startingEntity,
  similarEntities,
  onConfirm,
  onCancel,
  onInspect,
}: {
  startingEntity: SourceEntitySummary;
  similarEntities: { entity: SourceEntitySummary; score: number }[];
  onConfirm: (name: string, additionalBindings: SourceEntitySummary[]) => Promise<void>;
  onCancel: () => void;
  onInspect: (target: InspectTarget) => void;
}) {
  const suggestedName = toTitleCase(startingEntity.entityName);
  const [name, setName] = useState(suggestedName);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSelection = (se: SourceEntitySummary) => {
    const key = `${se.sourceId}:${se.entityName}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const additional = similarEntities
        .filter(({ entity: se }) => selected.has(`${se.sourceId}:${se.entityName}`))
        .map(({ entity }) => entity);
      await onConfirm(name.trim(), additional);
    } catch (e) {
      setError(String(e));
      setIsSubmitting(false);
    }
  };

  const selectedCount = selected.size;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onCancel} />
      <div className="fixed inset-x-0 top-1/2 z-50 mx-auto w-full max-w-[520px] -translate-y-1/2 rounded-lg border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Create Entity Type</h2>
          <button onClick={onCancel} className="rounded p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Error */}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Starting from */}
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

          {/* Entity type name */}
          <div className="space-y-1.5">
            <Label className="text-xs">Entity Type Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">
              Auto-suggested from table name. Edit freely.
            </p>
          </div>

          <Separator />

          {/* Similar tables */}
          {similarEntities.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Similar tables found (may represent the same concept):
              </p>
              <div className="rounded-md border border-border overflow-hidden">
                {similarEntities.map(({ entity: se, score }, i) => {
                  const key = `${se.sourceId}:${se.entityName}`;
                  const isChecked = selected.has(key);
                  const pct = Math.round(score * 100);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleSelection(se)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/30 ${
                        i < similarEntities.length - 1 ? "border-b border-border/50" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <div
                        className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center text-[10px] ${
                          isChecked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        }`}
                      >
                        {isChecked && "✓"}
                      </div>
                      <span className="font-mono text-xs">{se.entityName}</span>
                      <span className="text-xs text-muted-foreground">{se.sourceName}</span>
                      <div className="flex-1" />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {se.rowCount.toLocaleString()}
                      </span>
                      <div className="flex items-center gap-1">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">
                          {pct}%
                        </span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0 text-muted-foreground shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspect({
                                entityASourceId: startingEntity.sourceId,
                                entityAName: startingEntity.entityName,
                                entityASourceName: startingEntity.sourceName,
                                entityBSourceId: se.sourceId,
                                entityBName: se.entityName,
                                entityBSourceName: se.sourceName,
                              });
                            }}
                          >
                            <Eye size={11} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">Inspect comparison</TooltipContent>
                      </Tooltip>
                    </button>
                  );
                })}
              </div>
              {selectedCount > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {selectedCount} additional source{selectedCount !== 1 && "s"} selected.
                  Attribute mapping can be configured after creation.
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-3">
              <p className="text-xs text-muted-foreground">
                No similar tables detected.
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                You can add more source bindings later, or run "Find Similar" first.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!name.trim() || isSubmitting}
          >
            {isSubmitting ? "Creating…" : "Create Type"}
          </Button>
        </div>
      </div>
    </>
  );
}

// ── New Entity Dialog (from toolbar, no pre-selected table) ───────────────────

function NewEntityDialog({
  unboundEntities,
  onConfirm,
  onCancel,
}: {
  unboundEntities: SourceEntitySummary[];
  onConfirm: (name: string, selectedEntities: SourceEntitySummary[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSelection = (se: SourceEntitySummary) => {
    const key = `${se.sourceId}:${se.entityName}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!name.trim() || selected.size === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const entities = unboundEntities.filter((se) =>
        selected.has(`${se.sourceId}:${se.entityName}`),
      );
      await onConfirm(name.trim(), entities);
    } catch (e) {
      setError(String(e));
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onCancel} />
      <div className="fixed inset-x-0 top-1/2 z-50 mx-auto w-full max-w-[520px] -translate-y-1/2 rounded-lg border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">New Entity Type</h2>
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

          <div className="space-y-1.5">
            <Label className="text-xs">Entity Type Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer, Product, Order"
              className="h-8 text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Bind source tables {selected.size > 0 && `(${selected.size} selected)`}
            </Label>
            {unboundEntities.length > 0 ? (
              <div className="rounded-md border border-border overflow-hidden max-h-[240px] overflow-y-auto">
                {unboundEntities.map((se, i) => {
                  const key = `${se.sourceId}:${se.entityName}`;
                  const isChecked = selected.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleSelection(se)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/30 ${
                        i < unboundEntities.length - 1 ? "border-b border-border/50" : ""
                      }`}
                    >
                      <div
                        className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center text-[10px] ${
                          isChecked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        }`}
                      >
                        {isChecked && "✓"}
                      </div>
                      <span className="font-mono text-xs">{se.entityName}</span>
                      <span className="text-xs text-muted-foreground">{se.sourceName}</span>
                      <div className="flex-1" />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {se.rowCount.toLocaleString()} rows
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                No unbound source tables available.
              </p>
            )}
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
            disabled={!name.trim() || selected.size === 0 || isSubmitting}
          >
            {isSubmitting ? "Creating…" : "Create Type"}
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTitleCase(s: string): string {
  // "user_accounts" → "UserAccount", "customers" → "Customer"
  const stripped = s.replace(/s$/, ""); // naive de-pluralize
  return stripped
    .split(/[_\-\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}
