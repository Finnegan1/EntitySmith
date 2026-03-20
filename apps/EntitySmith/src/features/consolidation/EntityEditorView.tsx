import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Database,
  Eye,
  Link2,
  Loader2,
  Plus,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useJoinPlan } from "@/hooks/useJoinPlan";
import { useSchemaGraph } from "@/hooks/useSchemaGraph";
import { useConsolidation } from "@/hooks/useConsolidation";
import { MergeScoreBadge } from "./MergeScoreBadge";
import { computeMergeFactors } from "./SuggestionInspector";
import type {
  AttributeAlignment,
  EntityComparisonData,
  EntityTypeJoinStepWithKeys,
  EntityTypeWithBindings,
  JoinType,
  SourceEntitySummary,
} from "@/types";

type SampleRow = Record<string, string | null>;

// Right panel can show: overall preview, add-dataset browser, or join editor for a step
type RightPanelMode =
  | { kind: "preview" }
  | { kind: "add"; selectedCandidate: SourceEntitySummary | null }
  | { kind: "join"; stepIndex: number };

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

  const [rightPanel, setRightPanel] = useState<RightPanelMode>({ kind: "preview" });
  const [previewRows, setPreviewRows] = useState<SampleRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [addingDataset, setAddingDataset] = useState(false);

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
        setPreviewColumns(rows.length > 0 ? Object.keys(rows[0]) : []);
      })
      .catch(() => setPreviewRows(null))
      .finally(() => setPreviewLoading(false));
  }, [plan, et.entityType.id]);

  // Candidates
  const boundKeys = new Set(et.bindings.map((b) => `${b.sourceId}:${b.entityName}`));
  const candidates = sourceEntities
    .filter((se) => !se.boundEntityTypeId || se.boundEntityTypeId === et.entityType.id)
    .filter((se) => !boundKeys.has(`${se.sourceId}:${se.entityName}`));

  const suggestionKeys = new Set<string>();
  for (const pair of similarityPairs) {
    if (pair.status === "resolved") continue;
    for (const b of et.bindings) {
      if (b.sourceId === pair.entityASourceId && b.entityName === pair.entityAName)
        suggestionKeys.add(`${pair.entityBSourceId}:${pair.entityBName}`);
      else if (b.sourceId === pair.entityBSourceId && b.entityName === pair.entityBName)
        suggestionKeys.add(`${pair.entityASourceId}:${pair.entityAName}`);
    }
  }
  const suggestions = candidates.filter((se) => suggestionKeys.has(`${se.sourceId}:${se.entityName}`));
  const otherCandidates = candidates.filter((se) => !suggestionKeys.has(`${se.sourceId}:${se.entityName}`));

  const handleAddDataset = useCallback(
    async (se: SourceEntitySummary) => {
      setAddingDataset(true);
      try {
        await bindSourceEntity(et.entityType.id, se.sourceId, se.entityName);
        await addStep(se.sourceId, se.entityName, "left");
        setRightPanel({ kind: "preview" });
      } finally {
        setAddingDataset(false);
      }
    },
    [et.entityType.id, bindSourceEntity, addStep],
  );

  const handleRemoveStep = useCallback(
    async (stepWithKeys: EntityTypeJoinStepWithKeys) => {
      // If the right panel is showing this step's join editor, go back to preview
      if (rightPanel.kind === "join") setRightPanel({ kind: "preview" });
      const step = stepWithKeys.step;
      await removeStep(step.id);
      await unbindSourceEntity(et.entityType.id, step.sourceId, step.entityName);
    },
    [et.entityType.id, removeStep, unbindSourceEntity, rightPanel],
  );

  const handleMoveUp = useCallback(
    async (index: number) => {
      if (!plan || index <= 0) return;
      const ids = plan.steps.map((s) => s.step.id);
      [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
      await reorderSteps(ids);
      if (rightPanel.kind === "join") setRightPanel({ kind: "preview" });
    },
    [plan, reorderSteps, rightPanel],
  );

  const handleMoveDown = useCallback(
    async (index: number) => {
      if (!plan || index >= plan.steps.length - 1) return;
      const ids = plan.steps.map((s) => s.step.id);
      [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
      await reorderSteps(ids);
      if (rightPanel.kind === "join") setRightPanel({ kind: "preview" });
    },
    [plan, reorderSteps, rightPanel],
  );

  const steps = plan?.steps ?? [];
  const isPreview = rightPanel.kind === "preview";
  const isAdd = rightPanel.kind === "add";

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
          {steps.length} dataset{steps.length !== 1 && "s"}
        </Badge>
        <div className="flex-1" />

        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            onClick={() => setRightPanel({ kind: "preview" })}
            className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium transition-colors ${
              isPreview
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <Table2 size={12} />
            Preview
          </button>
          <button
            onClick={() => setRightPanel({ kind: "add", selectedCandidate: null })}
            className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium transition-colors border-l border-border ${
              isAdd
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <Plus size={12} />
            Add Dataset
            {suggestions.length > 0 && !isAdd && (
              <span className="ml-1 h-4 min-w-[16px] rounded-full bg-amber-500 px-1 text-[9px] text-white flex items-center justify-center">
                {suggestions.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Join Plan */}
        <div className="w-[300px] shrink-0 border-r border-border flex flex-col">
          <div className="flex items-center px-4 py-2 border-b border-border/50">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Join Plan
            </span>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0">
              {planLoading && steps.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                </div>
              )}

              {steps.length === 0 && !planLoading && (
                <div className="text-center py-8">
                  <Database size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">No datasets yet.</p>
                  <Button
                    size="sm" variant="outline" className="mt-3 h-7 gap-1.5 text-xs"
                    onClick={() => setRightPanel({ kind: "add", selectedCandidate: null })}
                  >
                    <Plus size={12} /> Add Dataset
                  </Button>
                </div>
              )}

              {steps.map((sw, index) => (
                <div key={sw.step.id}>
                  {/* Join connector — clickable to open join editor */}
                  {index > 0 && (
                    <button
                      onClick={() => setRightPanel({ kind: "join", stepIndex: index })}
                      className={`flex items-center gap-2 w-full py-1 px-2 mx-1 my-0.5 rounded transition-colors text-left ${
                        rightPanel.kind === "join" && rightPanel.stepIndex === index
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted/40 border border-transparent"
                      }`}
                    >
                      <Link2 size={11} className={`shrink-0 ${
                        rightPanel.kind === "join" && rightPanel.stepIndex === index
                          ? "text-primary" : "text-muted-foreground"
                      }`} />
                      <span className="text-[10px] text-muted-foreground">
                        {sw.step.joinType === "left" ? "LEFT" : sw.step.joinType === "inner" ? "INNER" : "FULL"}
                      </span>
                      {sw.keys.length > 0 ? (
                        <span className="text-[10px] text-muted-foreground truncate">
                          ON {sw.keys.map((k) => `${k.leftColumn}=${k.rightColumn}`).join(", ")}
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-500">no keys set</span>
                      )}
                    </button>
                  )}

                  {/* Step card */}
                  <div className={`rounded-md border overflow-hidden mx-1 ${
                    rightPanel.kind === "join" && rightPanel.stepIndex === index
                      ? "border-primary/40" : "border-border"
                  }`}>
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/10">
                      <div className="flex flex-col">
                        <button onClick={() => handleMoveUp(index)} disabled={index === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                          <ChevronUp size={11} />
                        </button>
                        <button onClick={() => handleMoveDown(index)} disabled={index === steps.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                          <ChevronDown size={11} />
                        </button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] font-medium truncate">{sw.step.entityName}</span>
                          <span className="text-[9px] text-muted-foreground">{sourceEntities.find((e) => e.sourceId === sw.step.sourceId && e.entityName === sw.step.entityName)?.sourceName ?? ""}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                          {sourceEntities.find((e) => e.sourceId === sw.step.sourceId && e.entityName === sw.step.entityName)?.rowCount.toLocaleString() ?? "?"} rows
                          {index === 0 && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3">BASE</Badge>}
                        </div>
                      </div>
                      <button onClick={() => handleRemoveStep(sw)} className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {rightPanel.kind === "preview" && (
            <PreviewPanel
              rows={previewRows} columns={previewColumns} loading={previewLoading}
              hasSteps={steps.length > 0}
              onSwitchToAdd={() => setRightPanel({ kind: "add", selectedCandidate: null })}
            />
          )}
          {rightPanel.kind === "add" && (
            <AddDatasetPanel
              entityType={et} suggestions={suggestions} otherCandidates={otherCandidates}
              selectedCandidate={rightPanel.selectedCandidate}
              onSelectCandidate={(se) => setRightPanel({ kind: "add", selectedCandidate: se })}
              onAdd={handleAddDataset} isAdding={addingDataset}
            />
          )}
          {rightPanel.kind === "join" && steps[rightPanel.stepIndex] && (
            <JoinEditorPanel
              entityTypeId={et.entityType.id}
              entityTypeName={et.entityType.name}
              stepWithKeys={steps[rightPanel.stepIndex]}
              onChangeJoinType={(jt) => updateStepType(steps[rightPanel.stepIndex].step.id, jt)}
              onSetKeys={(keys) => setJoinKeys(steps[rightPanel.stepIndex].step.id, keys)}
              onDone={() => setRightPanel({ kind: "preview" })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Join Editor Panel ─────────────────────────────────────────────────────────

function JoinEditorPanel({
  entityTypeId,
  entityTypeName,
  stepWithKeys,
  onChangeJoinType,
  onSetKeys,
  onDone,
}: {
  entityTypeId: string;
  entityTypeName: string;
  stepWithKeys: EntityTypeJoinStepWithKeys;
  onChangeJoinType: (jt: JoinType) => void;
  onSetKeys: (keys: [string, string][]) => void;
  onDone: () => void;
}) {
  const step = stepWithKeys.step;
  const keys = stepWithKeys.keys;

  const [leftCol, setLeftCol] = useState("");
  const [rightCol, setRightCol] = useState("");
  type InspectTab = "result" | "left" | "right";
  const [inspectTab, setInspectTab] = useState<InspectTab>("result");

  // Load column alignment / comparison data for suggestions
  const [comparison, setComparison] = useState<EntityComparisonData | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  useEffect(() => {
    setComparisonLoading(true);
    invoke<EntityComparisonData>("get_entity_type_comparison", {
      entityTypeId,
      candidateSourceId: step.sourceId,
      candidateEntityName: step.entityName,
    })
      .then(setComparison)
      .catch(() => setComparison(null))
      .finally(() => setComparisonLoading(false));
  }, [entityTypeId, step.sourceId, step.entityName]);

  // Derive suggested key pairs from comparison alignments
  const activeKeySet = new Set(keys.map((k) => `${k.leftColumn}::${k.rightColumn}`));
  const suggestedPairs: { left: string; right: string; confidence: number; matchType: string }[] = [];
  if (comparison) {
    for (const a of comparison.attributeAlignments) {
      if (
        (a.matchType === "exact" || a.matchType === "inferred") &&
        a.sourceAColumn &&
        a.sourceBColumn &&
        !activeKeySet.has(`${a.sourceAColumn}::${a.sourceBColumn}`)
      ) {
        suggestedPairs.push({
          left: a.sourceAColumn,
          right: a.sourceBColumn,
          confidence: a.confidence,
          matchType: a.matchType,
        });
      }
    }
    suggestedPairs.sort((a, b) => b.confidence - a.confidence);
  }

  // Load sample data for inspection tabs
  const [leftRows, setLeftRows] = useState<SampleRow[] | null>(null);
  const [rightRows, setRightRows] = useState<SampleRow[] | null>(null);
  const [resultRows, setResultRows] = useState<SampleRow[] | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    setDataLoading(true);
    const loadLeft = invoke<SampleRow[]>("get_entity_type_sample_rows", { entityTypeId, limit: 10 }).catch(() => null);
    const loadRight = invoke<SampleRow[]>("get_sample_rows", { sourceId: step.sourceId, entityName: step.entityName, limit: 10 }).catch(() => null);
    const loadResult = invoke<SampleRow[]>("get_entity_type_sample_rows", { entityTypeId, limit: 10 }).catch(() => null);

    Promise.all([loadLeft, loadRight, loadResult]).then(([l, r, res]) => {
      setLeftRows(l);
      setRightRows(r);
      setResultRows(res);
    }).finally(() => setDataLoading(false));
  }, [entityTypeId, step.sourceId, step.entityName, keys.length]);

  const activeRows = inspectTab === "left" ? leftRows : inspectTab === "right" ? rightRows : resultRows;
  const activeCols = activeRows && activeRows.length > 0 ? Object.keys(activeRows[0]) : [];

  const handleUseSuggestion = (left: string, right: string) => {
    const newKeys: [string, string][] = [
      ...keys.map((k) => [k.leftColumn, k.rightColumn] as [string, string]),
      [left, right],
    ];
    onSetKeys(newKeys);
  };

  const handleUseAllSuggestions = () => {
    const newKeys: [string, string][] = [
      ...keys.map((k) => [k.leftColumn, k.rightColumn] as [string, string]),
      ...suggestedPairs.map((s) => [s.left, s.right] as [string, string]),
    ];
    onSetKeys(newKeys);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
        <Link2 size={14} className="text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium">Join Configuration</span>
          <span className="text-[10px] text-muted-foreground ml-2">
            {entityTypeName} ↔ {step.entityName}
          </span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDone}>
          Done
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Join type */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Join Type
            </p>
            <div className="flex gap-2">
              {(["left", "inner", "full_outer"] as JoinType[]).map((jt) => (
                <button
                  key={jt}
                  onClick={() => onChangeJoinType(jt)}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                    step.joinType === jt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {jt === "left" ? "LEFT JOIN" : jt === "inner" ? "INNER JOIN" : "FULL OUTER JOIN"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {step.joinType === "left"
                ? "Keep all rows from the accumulated entity, add matching rows from this dataset."
                : step.joinType === "inner"
                  ? "Only keep rows that match in both the entity and this dataset."
                  : "Keep all rows from both sides, filling gaps with nulls."}
            </p>
          </div>

          {/* Suggested keys from column alignment */}
          {comparisonLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Detecting potential join keys…
            </div>
          )}

          {!comparisonLoading && suggestedPairs.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Detected Key Candidates
                </p>
                <Button
                  size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1"
                  onClick={handleUseAllSuggestions}
                >
                  <Plus size={10} />
                  Use All
                </Button>
              </div>
              <div className="space-y-1">
                {suggestedPairs.map((s) => {
                  const pct = Math.round(s.confidence * 100);
                  return (
                    <button
                      key={`${s.left}::${s.right}`}
                      onClick={() => handleUseSuggestion(s.left, s.right)}
                      className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-1.5 text-left hover:bg-primary/5 hover:border-primary/30 transition-colors group"
                    >
                      <span className="font-mono text-[11px] font-medium">{s.left}</span>
                      <span className="text-[10px] text-muted-foreground">=</span>
                      <span className="font-mono text-[11px] font-medium">{s.right}</span>
                      <div className="flex-1" />
                      <Badge
                        variant={s.matchType === "exact" ? "default" : "secondary"}
                        className="text-[9px] px-1.5 py-0 h-4"
                      >
                        {s.matchType === "exact" ? "exact" : "inferred"}
                      </Badge>
                      <span className={`text-[10px] tabular-nums ${pct >= 80 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {pct}%
                      </span>
                      <Plus size={12} className="text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active join keys */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Join Keys
            </p>
            {keys.length === 0 && suggestedPairs.length === 0 && !comparisonLoading && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 mb-2">
                No join keys configured and no candidates detected. Add keys manually below.
              </div>
            )}
            {keys.length === 0 && suggestedPairs.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 mb-2">
                No join keys configured. Use a suggested candidate above or add manually.
              </div>
            )}
            <div className="space-y-1.5">
              {keys.map((k, ki) => (
                <div key={k.id} className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5">
                  <span className="font-mono text-[11px] font-medium">{k.leftColumn}</span>
                  <span className="text-[10px] text-muted-foreground">=</span>
                  <span className="font-mono text-[11px] font-medium">{k.rightColumn}</span>
                  <div className="flex-1" />
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-primary/30 text-primary">active</Badge>
                  <button
                    onClick={() => {
                      const newKeys: [string, string][] = keys
                        .filter((_, i) => i !== ki)
                        .map((kk) => [kk.leftColumn, kk.rightColumn]);
                      onSetKeys(newKeys);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  placeholder={`column from ${entityTypeName}`}
                  value={leftCol}
                  onChange={(e) => setLeftCol(e.target.value)}
                  className="h-7 flex-1 rounded border border-border bg-background px-2 text-[11px] font-mono"
                />
                <span className="text-xs text-muted-foreground">=</span>
                <input
                  type="text"
                  placeholder={`column from ${step.entityName}`}
                  value={rightCol}
                  onChange={(e) => setRightCol(e.target.value)}
                  className="h-7 flex-1 rounded border border-border bg-background px-2 text-[11px] font-mono"
                />
                <Button
                  size="sm" variant="outline" className="h-7 px-2.5 text-xs"
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
                  <Plus size={12} />
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Column alignment overview */}
          {!comparisonLoading && comparison && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Column Alignment
              </p>
              <InlineColumnAlignment
                alignments={comparison.attributeAlignments}
                entityAName={entityTypeName}
                entityBName={step.entityName}
              />
            </div>
          )}

          {/* Data inspection */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Data Inspection
            </p>
            <div className="flex rounded-md border border-border overflow-hidden mb-3">
              {([
                { key: "result" as InspectTab, label: "Merged Result" },
                { key: "left" as InspectTab, label: entityTypeName },
                { key: "right" as InspectTab, label: step.entityName },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setInspectTab(tab.key)}
                  className={`flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    inspectTab === tab.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted/50"
                  } ${tab.key !== "result" ? "border-l border-border" : ""}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {dataLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
              </div>
            )}

            {!dataLoading && activeRows && activeRows.length > 0 && (
              <div className="rounded-md border border-border overflow-hidden">
                <div className="overflow-x-auto max-h-[300px]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 sticky top-0 z-10">
                        {activeCols.map((col) => (
                          <th key={col} className="px-2.5 py-1.5 text-left whitespace-nowrap font-mono font-medium text-foreground text-[10px]">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeRows.map((row, i) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                          {activeCols.map((col) => (
                            <td key={col} className="px-2.5 py-1 whitespace-nowrap max-w-[160px] truncate font-mono text-[10px]" title={row[col] ?? ""}>
                              {row[col] != null ? row[col] : <span className="text-muted-foreground/30 italic">null</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!dataLoading && (!activeRows || activeRows.length === 0) && (
              <div className="rounded-md border border-border px-4 py-6 text-center text-xs text-muted-foreground">
                No sample data available.
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Preview Panel ─────────────────────────────────────────────────────────────

function PreviewPanel({
  rows, columns, loading, hasSteps, onSwitchToAdd,
}: {
  rows: SampleRow[] | null;
  columns: string[];
  loading: boolean;
  hasSteps: boolean;
  onSwitchToAdd: () => void;
}) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading preview…
      </div>
    );
  }
  if (!hasSteps || !rows) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Table2 size={32} strokeWidth={1} className="opacity-40" />
        <p className="text-sm">No data to preview yet</p>
        <p className="text-xs">Add datasets to see the merged entity data.</p>
        <Button size="sm" variant="outline" className="mt-2 h-7 gap-1.5 text-xs" onClick={onSwitchToAdd}>
          <Plus size={12} /> Add Dataset
        </Button>
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">No sample rows.</div>;
  }
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/20 sticky top-0 z-10">
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 text-left whitespace-nowrap font-mono font-medium text-foreground">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
              {columns.map((col) => (
                <td key={col} className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate font-mono" title={row[col] ?? ""}>
                  {row[col] != null ? row[col] : <span className="text-muted-foreground/30 italic">null</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Add Dataset Panel ─────────────────────────────────────────────────────────

function AddDatasetPanel({
  entityType, suggestions, otherCandidates, selectedCandidate, onSelectCandidate, onAdd, isAdding,
}: {
  entityType: EntityTypeWithBindings;
  suggestions: SourceEntitySummary[];
  otherCandidates: SourceEntitySummary[];
  selectedCandidate: SourceEntitySummary | null;
  onSelectCandidate: (se: SourceEntitySummary | null) => void;
  onAdd: (se: SourceEntitySummary) => Promise<void>;
  isAdding: boolean;
}) {
  const binding = entityType.bindings[0];
  const [comparison, setComparison] = useState<EntityComparisonData | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  useEffect(() => {
    if (!selectedCandidate) { setComparison(null); return; }
    setComparisonLoading(true);
    invoke<EntityComparisonData>("get_entity_type_comparison", {
      entityTypeId: entityType.entityType.id,
      candidateSourceId: selectedCandidate.sourceId,
      candidateEntityName: selectedCandidate.entityName,
    })
      .then(setComparison)
      .catch(() => setComparison(null))
      .finally(() => setComparisonLoading(false));
  }, [selectedCandidate, entityType.entityType.id]);

  if (selectedCandidate) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
          <button onClick={() => onSelectCandidate(null)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} />
          </button>
          <div className="min-w-0 flex-1">
            <span className="font-mono text-xs font-medium">{selectedCandidate.entityName}</span>
            <span className="text-[10px] text-muted-foreground ml-2">{selectedCandidate.sourceName}</span>
            <span className="text-[10px] text-muted-foreground ml-2 tabular-nums">{selectedCandidate.rowCount.toLocaleString()} rows</span>
          </div>
          <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={isAdding} onClick={() => onAdd(selectedCandidate)}>
            {isAdding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {isAdding ? "Adding…" : "Add to Entity"}
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {comparisonLoading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          )}
          {!comparisonLoading && comparison && (
            <div className="p-4 space-y-4">
              <InlineMergeScore comparison={comparison} />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Column Alignment</p>
                <InlineColumnAlignment alignments={comparison.attributeAlignments} entityAName={entityType.entityType.name} entityBName={selectedCandidate.entityName} />
              </div>
            </div>
          )}
          {!comparisonLoading && !comparison && (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">Unable to load comparison.</div>
          )}
        </ScrollArea>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        {suggestions.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Suggested Tables</p>
            <div className="space-y-1.5">
              {suggestions.map((se) => (
                <CandidateRow key={`${se.sourceId}:${se.entityName}`} entity={se} binding={binding} entityTypeId={entityType.entityType.id} showScore onClick={() => onSelectCandidate(se)} />
              ))}
            </div>
          </div>
        )}
        {otherCandidates.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{suggestions.length > 0 ? "Other Available" : "Available Tables"}</p>
            <div className="space-y-1.5">
              {otherCandidates.map((se) => (
                <CandidateRow key={`${se.sourceId}:${se.entityName}`} entity={se} binding={binding} entityTypeId={entityType.entityType.id} showScore={!!binding} onClick={() => onSelectCandidate(se)} />
              ))}
            </div>
          </div>
        )}
        {suggestions.length === 0 && otherCandidates.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Database size={28} className="mx-auto opacity-40 mb-2" />
            <p className="text-sm">No available tables</p>
            <p className="text-xs mt-1">Register more data sources to add datasets.</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// ── Shared small components ───────────────────────────────────────────────────

function CandidateRow({ entity: se, binding, entityTypeId, showScore, onClick }: {
  entity: SourceEntitySummary;
  binding: { sourceId: string; entityName: string } | undefined;
  entityTypeId: string;
  showScore: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left hover:bg-muted/30 hover:border-border/80 transition-colors group">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium">{se.entityName}</span>
          <span className="text-[10px] text-muted-foreground">{se.sourceName}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{se.rowCount.toLocaleString()} rows</span>
      </div>
      {showScore && binding && (
        <MergeScoreBadge entityASourceId={binding.sourceId} entityAName={binding.entityName} entityBSourceId={se.sourceId} entityBName={se.entityName} entityTypeId={entityTypeId} />
      )}
      <Eye size={14} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
    </button>
  );
}

function scoreColor(v: number) { return v >= 0.8 ? "text-green-600" : v >= 0.5 ? "text-amber-600" : "text-red-500"; }
function scoreBarColor(v: number) { return v >= 0.8 ? "bg-green-500" : v >= 0.5 ? "bg-amber-500" : "bg-red-400"; }

function InlineMergeScore({ comparison }: { comparison: EntityComparisonData }) {
  const m = computeMergeFactors(comparison.attributeAlignments, comparison.entityA.attributes, comparison.entityB.attributes, comparison.scoringDetails);
  const pct = Math.round(m.composite * 100);
  const factors = [
    { label: "Value Overlap", value: m.factors.valueOverlap, detail: `${m.colsWithOverlapCount} col${m.colsWithOverlapCount !== 1 ? "s" : ""}` },
    { label: "Schema Overlap", value: m.factors.schemaOverlap, detail: `${m.matchedCount}/${m.totalA + m.totalB} cols` },
    { label: "Type Alignment", value: m.factors.typeAlignment, detail: `${m.typeAlignmentCount}/${m.matchedCount}` },
    { label: "Completeness", value: m.factors.completeness, detail: "null gaps" },
    { label: "Name Similarity", value: m.factors.nameSimilarity, detail: "Jaro-Winkler" },
  ];
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/20 border-b border-border">
        <span className={`text-lg font-bold tabular-nums ${scoreColor(m.composite)}`}>{pct}%</span>
        <div className="h-2.5 flex-1 max-w-[200px] overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${scoreBarColor(m.composite)}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground">{pct >= 80 ? "Highly compatible" : pct >= 50 ? "Moderate" : "Low compatibility"}</span>
      </div>
      <div className="divide-y divide-border/30">
        {factors.map((f) => {
          const fpct = Math.round(f.value * 100);
          return (
            <div key={f.label} className="flex items-center gap-3 px-4 py-1.5 text-xs">
              <span className="w-28 shrink-0 text-muted-foreground">{f.label}</span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${scoreBarColor(f.value)}`} style={{ width: `${fpct}%` }} />
              </div>
              <span className={`tabular-nums w-8 text-right ${scoreColor(f.value)}`}>{fpct}%</span>
              <span className="text-[10px] text-muted-foreground">{f.detail}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InlineColumnAlignment({ alignments, entityAName, entityBName }: { alignments: AttributeAlignment[]; entityAName: string; entityBName: string }) {
  return (
    <div className="rounded-md border border-border overflow-hidden text-xs">
      <div className="grid grid-cols-[1fr_80px_1fr] gap-0 bg-muted/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground border-b border-border">
        <span>{entityAName}</span><span className="text-center">Match</span><span>{entityBName}</span>
      </div>
      {alignments.map((a, i) => {
        const isExact = a.matchType === "exact";
        const isInferred = a.matchType === "inferred";
        const pct = Math.round(a.confidence * 100);
        return (
          <div key={i} className="grid grid-cols-[1fr_80px_1fr] gap-0 border-b border-border/30 last:border-b-0 px-3 py-1.5">
            <div className={a.matchType === "unmatched_b" ? "opacity-30" : ""}>
              {a.sourceAColumn && <span className="font-mono text-[11px]">{a.sourceAColumn} {a.sourceAType && <span className="text-[9px] text-muted-foreground ml-1">{a.sourceAType}</span>}</span>}
            </div>
            <div className="flex items-center justify-center">
              {(isExact || isInferred) && <span className={`text-[10px] tabular-nums ${isExact ? "text-primary font-medium" : "text-muted-foreground"}`}>{pct}%</span>}
              {a.matchType === "unmatched_a" && <span className="text-[9px] text-muted-foreground/50">only A</span>}
              {a.matchType === "unmatched_b" && <span className="text-[9px] text-muted-foreground/50">only B</span>}
            </div>
            <div className={a.matchType === "unmatched_a" ? "opacity-30" : ""}>
              {a.sourceBColumn && <span className="font-mono text-[11px]">{a.sourceBColumn} {a.sourceBType && <span className="text-[9px] text-muted-foreground ml-1">{a.sourceBType}</span>}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
