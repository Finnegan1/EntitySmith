import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Database,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useJoinPlan } from "@/hooks/useJoinPlan";
import { useSchemaGraph } from "@/hooks/useSchemaGraph";
import { useConsolidation } from "@/hooks/useConsolidation";
import { SuggestionInspector } from "./SuggestionInspector";
import { MergeScoreBadge } from "./MergeScoreBadge";
import type {
  EntityTypeJoinStepWithKeys,
  EntityTypeWithBindings,
  JoinType,
  SourceEntitySummary,
} from "@/types";

type SampleRow = Record<string, string | null>;

interface EntityEditorViewProps {
  entityType: EntityTypeWithBindings;
  onBack: () => void;
}

export function EntityEditorView({ entityType, onBack }: EntityEditorViewProps) {
  const et = entityType;
  const { plan, isLoading: planLoading, addStep, removeStep, reorderSteps, updateStepType, setJoinKeys } =
    useJoinPlan(et.entityType.id);
  const { sourceEntities, bindSourceEntity, unbindSourceEntity } = useSchemaGraph();
  const { similarityPairs } = useConsolidation();

  const [previewRows, setPreviewRows] = useState<SampleRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [showAddDataset, setShowAddDataset] = useState(false);
  const [inspecting, setInspecting] = useState<{
    entityASourceId: string;
    entityAName: string;
    entityBSourceId: string;
    entityBName: string;
    entityTypeId?: string;
    entityASourceName?: string;
    entityBSourceName?: string;
    onAdd?: () => Promise<void>;
  } | null>(null);

  // Load preview whenever plan changes
  useEffect(() => {
    if (!plan || plan.steps.length === 0) {
      setPreviewRows(null);
      setPreviewColumns([]);
      return;
    }
    setPreviewLoading(true);
    invoke<SampleRow[]>("get_entity_type_sample_rows", {
      entityTypeId: et.entityType.id,
      limit: 20,
    })
      .then((rows) => {
        setPreviewRows(rows);
        if (rows.length > 0) {
          setPreviewColumns(Object.keys(rows[0]));
        }
      })
      .catch(() => setPreviewRows(null))
      .finally(() => setPreviewLoading(false));
  }, [plan, et.entityType.id]);

  // Find unbound entities that could be added
  const boundKeys = new Set(
    et.bindings.map((b) => `${b.sourceId}:${b.entityName}`),
  );
  const candidates = sourceEntities.filter(
    (se) => !se.boundEntityTypeId || se.boundEntityTypeId === et.entityType.id,
  ).filter((se) => !boundKeys.has(`${se.sourceId}:${se.entityName}`));

  // Find suggestions from similarity pairs
  const suggestions = candidates.filter((se) => {
    return similarityPairs.some((pair) => {
      if (pair.status === "resolved") return false;
      const matchesA =
        et.bindings.some(
          (b) => b.sourceId === pair.entityASourceId && b.entityName === pair.entityAName,
        ) &&
        se.sourceId === pair.entityBSourceId &&
        se.entityName === pair.entityBName;
      const matchesB =
        et.bindings.some(
          (b) => b.sourceId === pair.entityBSourceId && b.entityName === pair.entityBName,
        ) &&
        se.sourceId === pair.entityASourceId &&
        se.entityName === pair.entityAName;
      return matchesA || matchesB;
    });
  });

  const handleAddDataset = useCallback(
    async (se: SourceEntitySummary) => {
      await bindSourceEntity(et.entityType.id, se.sourceId, se.entityName);
      // Also add as a join step
      await addStep(se.sourceId, se.entityName, "left");
      setShowAddDataset(false);
    },
    [et.entityType.id, bindSourceEntity, addStep],
  );

  const handleRemoveStep = useCallback(
    async (stepWithKeys: EntityTypeJoinStepWithKeys) => {
      const step = stepWithKeys.step;
      await removeStep(step.id);
      await unbindSourceEntity(et.entityType.id, step.sourceId, step.entityName);
    },
    [et.entityType.id, removeStep, unbindSourceEntity],
  );

  const handleMoveUp = useCallback(
    async (index: number) => {
      if (!plan || index <= 0) return;
      const ids = plan.steps.map((s) => s.step.id);
      [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
      await reorderSteps(ids);
    },
    [plan, reorderSteps],
  );

  const handleMoveDown = useCallback(
    async (index: number) => {
      if (!plan || index >= plan.steps.length - 1) return;
      const ids = plan.steps.map((s) => s.step.id);
      [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
      await reorderSteps(ids);
    },
    [plan, reorderSteps],
  );

  const steps = plan?.steps ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={onBack}>
          <ArrowLeft size={14} />
          Back
        </Button>
        <div className="h-4 w-px bg-border" />
        <h2 className="text-sm font-semibold">{et.entityType.name}</h2>
        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
          {et.bindings.length} dataset{et.bindings.length !== 1 && "s"}
        </Badge>
        <div className="flex-1" />
      </div>

      {/* Main content: left panel (join plan) + right panel (preview) */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Join Plan Builder */}
        <div className="w-[420px] shrink-0 border-r border-border flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Join Plan
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() => setShowAddDataset(true)}
            >
              <Plus size={10} />
              Add Dataset
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-0">
              {planLoading && steps.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  Loading…
                </div>
              )}

              {steps.length === 0 && !planLoading && (
                <div className="text-center py-8">
                  <Database size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">No datasets in join plan yet.</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Add a dataset to start building this entity.
                  </p>
                </div>
              )}

              {steps.map((stepWithKeys, index) => (
                <JoinStepCard
                  key={stepWithKeys.step.id}
                  stepWithKeys={stepWithKeys}
                  isFirst={index === 0}
                  isLast={index === steps.length - 1}
                  sourceEntities={sourceEntities}
                  onMoveUp={() => handleMoveUp(index)}
                  onMoveDown={() => handleMoveDown(index)}
                  onRemove={() => handleRemoveStep(stepWithKeys)}
                  onChangeJoinType={(jt) => updateStepType(stepWithKeys.step.id, jt)}
                  onSetKeys={(keys) => setJoinKeys(stepWithKeys.step.id, keys)}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Preview */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center px-4 py-2 border-b border-border bg-muted/20">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Merged Data Preview
            </span>
            {previewRows && (
              <span className="text-[10px] text-muted-foreground ml-2">
                {previewRows.length} sample rows · {previewColumns.length} columns
              </span>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {previewLoading && (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Loading preview…
              </div>
            )}

            {!previewLoading && !previewRows && (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                Add datasets to see a preview of the merged entity.
              </div>
            )}

            {!previewLoading && previewRows && previewRows.length === 0 && (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                No sample rows available.
              </div>
            )}

            {!previewLoading && previewRows && previewRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 sticky top-0">
                      {previewColumns.map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left whitespace-nowrap font-mono font-medium text-foreground"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                        {previewColumns.map((col) => (
                          <td
                            key={col}
                            className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate font-mono"
                            title={row[col] ?? ""}
                          >
                            {row[col] != null ? (
                              row[col]
                            ) : (
                              <span className="text-muted-foreground/30 italic">null</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Dataset Drawer */}
      {showAddDataset && (
        <AddDatasetDrawer
          entityType={et}
          candidates={candidates}
          suggestions={suggestions}
          sourceEntities={sourceEntities}
          onAdd={handleAddDataset}
          onInspect={setInspecting}
          onClose={() => setShowAddDataset(false)}
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
          entityTypeId={inspecting.entityTypeId}
          onClose={() => setInspecting(null)}
          onAdd={inspecting.onAdd}
        />
      )}
    </div>
  );
}

// ── Join Step Card ────────────────────────────────────────────────────────────

function JoinStepCard({
  stepWithKeys,
  isFirst,
  isLast,
  sourceEntities,
  onMoveUp,
  onMoveDown,
  onRemove,
  onChangeJoinType,
  onSetKeys,
}: {
  stepWithKeys: EntityTypeJoinStepWithKeys;
  isFirst: boolean;
  isLast: boolean;
  sourceEntities: SourceEntitySummary[];
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onChangeJoinType: (jt: JoinType) => void;
  onSetKeys: (keys: [string, string][]) => void;
}) {
  const step = stepWithKeys.step;
  const keys = stepWithKeys.keys;
  const se = sourceEntities.find(
    (e) => e.sourceId === step.sourceId && e.entityName === step.entityName,
  );
  const [editingKeys, setEditingKeys] = useState(false);
  const [leftCol, setLeftCol] = useState("");
  const [rightCol, setRightCol] = useState("");

  return (
    <div className="relative">
      {/* Connector line */}
      {!isFirst && (
        <div className="flex items-center gap-2 py-1.5 px-3">
          <div className="w-8 flex justify-center">
            <div className="h-4 w-px bg-border" />
          </div>
          <select
            value={step.joinType}
            onChange={(e) => onChangeJoinType(e.target.value as JoinType)}
            className="text-[10px] bg-muted/40 border border-border rounded px-1.5 py-0.5 text-muted-foreground"
          >
            <option value="left">LEFT JOIN</option>
            <option value="inner">INNER JOIN</option>
            <option value="full_outer">FULL OUTER JOIN</option>
          </select>
          {keys.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              ON {keys.map((k) => `${k.leftColumn} = ${k.rightColumn}`).join(", ")}
            </span>
          )}
          {keys.length === 0 && (
            <span className="text-[10px] text-amber-500">no join keys set</span>
          )}
        </div>
      )}

      {/* Step card */}
      <div className="rounded-md border border-border overflow-hidden mx-1">
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/10">
          {/* Reorder controls */}
          <div className="flex flex-col gap-0">
            <button
              onClick={onMoveUp}
              disabled={isFirst}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-default"
            >
              <ChevronUp size={12} />
            </button>
            <button
              onClick={onMoveDown}
              disabled={isLast}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-default"
            >
              <ChevronDown size={12} />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-medium truncate">{step.entityName}</span>
              <span className="text-[10px] text-muted-foreground">{se?.sourceName ?? step.sourceId.slice(0, 8)}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
              {se && <span>{se.rowCount.toLocaleString()} rows</span>}
              {isFirst && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                  BASE
                </Badge>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {!isFirst && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px] text-muted-foreground"
                onClick={() => setEditingKeys(!editingKeys)}
              >
                {editingKeys ? "Done" : "Keys"}
              </Button>
            )}
            <button
              onClick={onRemove}
              className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Key editor (inline) */}
        {editingKeys && !isFirst && (
          <div className="border-t border-border px-3 py-2 bg-muted/5 space-y-2">
            <p className="text-[10px] text-muted-foreground">
              Define which columns to join on:
            </p>
            {keys.map((k, ki) => (
              <div key={k.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-[10px] bg-muted/40 px-1.5 py-0.5 rounded">{k.leftColumn}</span>
                <span className="text-muted-foreground">=</span>
                <span className="font-mono text-[10px] bg-muted/40 px-1.5 py-0.5 rounded">{k.rightColumn}</span>
                <button
                  onClick={() => {
                    const newKeys: [string, string][] = keys
                      .filter((_, i) => i !== ki)
                      .map((kk) => [kk.leftColumn, kk.rightColumn]);
                    onSetKeys(newKeys);
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="left column"
                value={leftCol}
                onChange={(e) => setLeftCol(e.target.value)}
                className="h-6 w-24 rounded border border-border bg-background px-1.5 text-[10px] font-mono"
              />
              <span className="text-[10px] text-muted-foreground">=</span>
              <input
                type="text"
                placeholder="right column"
                value={rightCol}
                onChange={(e) => setRightCol(e.target.value)}
                className="h-6 w-24 rounded border border-border bg-background px-1.5 text-[10px] font-mono"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px]"
                disabled={!leftCol.trim() || !rightCol.trim()}
                onClick={() => {
                  const newKeys: [string, string][] = [
                    ...keys.map((k) => [k.leftColumn, k.rightColumn] as [string, string]),
                    [leftCol.trim(), rightCol.trim()],
                  ];
                  onSetKeys(newKeys);
                  setLeftCol("");
                  setRightCol("");
                }}
              >
                <Plus size={10} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add Dataset Drawer ────────────────────────────────────────────────────────

function AddDatasetDrawer({
  entityType,
  candidates,
  suggestions,
  sourceEntities,
  onAdd,
  onInspect,
  onClose,
}: {
  entityType: EntityTypeWithBindings;
  candidates: SourceEntitySummary[];
  suggestions: SourceEntitySummary[];
  sourceEntities: SourceEntitySummary[];
  onAdd: (se: SourceEntitySummary) => Promise<void>;
  onInspect: (target: {
    entityASourceId: string;
    entityAName: string;
    entityBSourceId: string;
    entityBName: string;
    entityTypeId?: string;
    entityASourceName?: string;
    entityBSourceName?: string;
    onAdd?: () => Promise<void>;
  }) => void;
  onClose: () => void;
}) {
  const et = entityType;
  const binding = et.bindings[0];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-40 w-[400px] bg-background border-l border-border shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Add Dataset</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Suggested (similar tables)
                </p>
                <div className="space-y-1">
                  {suggestions.map((se) => (
                    <button
                      key={`${se.sourceId}:${se.entityName}`}
                      className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/30 transition-colors"
                      onClick={() => {
                        if (!binding) return;
                        onInspect({
                          entityASourceId: binding.sourceId,
                          entityAName: et.entityType.name,
                          entityASourceName: sourceEntities.find(
                            (e) => e.sourceId === binding.sourceId && e.entityName === binding.entityName,
                          )?.sourceName,
                          entityBSourceId: se.sourceId,
                          entityBName: se.entityName,
                          entityBSourceName: se.sourceName,
                          entityTypeId: et.entityType.id,
                          onAdd: () => onAdd(se),
                        });
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs">{se.entityName}</span>
                        <span className="text-xs text-muted-foreground ml-2">{se.sourceName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {se.rowCount.toLocaleString()} rows
                      </span>
                      {binding && (
                        <MergeScoreBadge
                          entityASourceId={binding.sourceId}
                          entityAName={binding.entityName}
                          entityBSourceId={se.sourceId}
                          entityBName={se.entityName}
                          entityTypeId={et.entityType.id}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* All candidates */}
            {candidates.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  All Available Tables
                </p>
                <div className="space-y-1">
                  {candidates.map((se) => (
                    <button
                      key={`${se.sourceId}:${se.entityName}`}
                      className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/30 transition-colors"
                      onClick={() => {
                        if (!binding) {
                          onAdd(se);
                          return;
                        }
                        onInspect({
                          entityASourceId: binding.sourceId,
                          entityAName: et.entityType.name,
                          entityASourceName: sourceEntities.find(
                            (e) => e.sourceId === binding.sourceId && e.entityName === binding.entityName,
                          )?.sourceName,
                          entityBSourceId: se.sourceId,
                          entityBName: se.entityName,
                          entityBSourceName: se.sourceName,
                          entityTypeId: et.entityType.id,
                          onAdd: () => onAdd(se),
                        });
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs">{se.entityName}</span>
                        <span className="text-xs text-muted-foreground ml-2">{se.sourceName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {se.rowCount.toLocaleString()} rows
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {candidates.length === 0 && suggestions.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No unbound tables available. Register more sources first.
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
