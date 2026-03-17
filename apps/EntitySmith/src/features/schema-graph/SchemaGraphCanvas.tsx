import { useEffect, useState, useCallback, useRef } from "react";
import { SigmaContainer, useSigma, useLoadGraph, useRegisterEvents } from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import { MultiDirectedGraph } from "graphology";
import circular from "graphology-layout/circular";
import noverlap from "graphology-layout-noverlap";
import EdgeCurveProgram, {
  EdgeCurvedArrowProgram,
  createDrawCurvedEdgeLabel,
  DEFAULT_EDGE_CURVE_PROGRAM_OPTIONS,
  indexParallelEdgesIndex,
} from "@sigma/edge-curve";
import type { EdgeProgramType } from "sigma/rendering";
import type { EntityTypeWithBindings, SchemaGraph } from "@/types";

// ── Sigma settings ────────────────────────────────────────────────────────────

const SIGMA_SETTINGS = {
  renderEdgeLabels: true,
  defaultEdgeType: "curvedArrow",
  edgeProgramClasses: {
    curved: EdgeCurveProgram as EdgeProgramType,
    curvedArrow: EdgeCurvedArrowProgram as EdgeProgramType,
  },
  // Node appearance
  defaultNodeColor: "#0f7a8c",
  labelSize: 12,
  labelWeight: "600",
  labelColor: { color: "#1e293b" },
  labelDensity: 1,
  labelGridCellSize: 60,
  labelRenderedSizeThreshold: -Infinity,
  // Edge appearance
  defaultEdgeColor: "#94a3b8",
  edgeLabelSize: 11,
  edgeLabelColor: { color: "#475569" },
  // Position edge labels along the curve, not at the straight-line midpoint.
  // Without this, parallel (bidirectional) edge labels overlap each other.
  defaultDrawEdgeLabel: createDrawCurvedEdgeLabel({
    ...DEFAULT_EDGE_CURVE_PROGRAM_OPTIONS,
    keepLabelUpright: true,
  }),
  // Layout
  minCameraRatio: 0.1,
  maxCameraRatio: 5,
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface SchemaGraphCanvasProps {
  graph: SchemaGraph;
  selectedEntityTypeId: string | null;
  onEntityTypeSelect: (et: EntityTypeWithBindings | null) => void;
  onAddRelationship: (sourceId: string, targetId: string, predicate: string) => Promise<void>;
  onUpdateRelationship: (id: string, predicate: string) => Promise<void>;
  onDeleteRelationship: (id: string) => Promise<void>;
}

// ── Inner component (uses sigma hooks) ───────────────────────────────────────

interface EditingEdge {
  id: string;
  predicate: string;
  x: number;
  y: number;
}

function GraphLoader({
  graph,
  selectedEntityTypeId,
  onEntityTypeSelect,
  onUpdateRelationship,
}: Pick<
  SchemaGraphCanvasProps,
  "graph" | "selectedEntityTypeId" | "onEntityTypeSelect" | "onUpdateRelationship"
> & { onUpdateRelationship: (id: string, predicate: string) => Promise<void> }) {
  const sigma = useSigma();
  const loadGraph = useLoadGraph();
  const registerEvents = useRegisterEvents();
  const [editingEdge, setEditingEdge] = useState<EditingEdge | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Build and layout the graph whenever data changes
  useEffect(() => {
    const g = new MultiDirectedGraph();

    for (const et of graph.entityTypes) {
      g.addNode(et.entityType.id, {
        label: et.entityType.name,
        size: 18 + Math.min(et.bindings.length * 2, 12),
        color: et.entityType.id === selectedEntityTypeId ? "#0a5f70" : "#0f7a8c",
        x: 0,
        y: 0,
      });
    }

    for (const rel of graph.relationships) {
      g.addDirectedEdgeWithKey(rel.id, rel.sourceEntityTypeId, rel.targetEntityTypeId, {
        label: rel.predicate,
        forceLabel: true,
        type: "curvedArrow",
        size: 2,
        color: "#94a3b8",
      });
    }

    // 1. Start with circular layout for a clean initial spread
    circular.assign(g, { scale: 200 });

    // 2. Set curvature for parallel (multi) edges between same node pair
    indexParallelEdgesIndex(g, {
      edgeIndexAttribute: "parallelIndex",
      edgeMaxIndexAttribute: "parallelMaxIndex",
    });

    // 3. Run no-overlap to distribute nodes without collisions
    noverlap.assign(g, {
      maxIterations: 500,
      settings: {
        margin: 30,
        ratio: 2.5,
        speed: 5,
      },
    });

    loadGraph(g);

    // Fit camera to the graph after loading
    setTimeout(() => sigma.getCamera().animatedReset(), 50);
  }, [graph, selectedEntityTypeId, loadGraph, sigma]);

  // Node & edge click events
  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => {
        const et = graph.entityTypes.find((e) => e.entityType.id === node);
        onEntityTypeSelect(node === selectedEntityTypeId ? null : (et ?? null));
      },
      clickEdge: ({ edge, event }) => {
        const g = sigma.getGraph();
        const predicate = String(g.getEdgeAttribute(edge, "label") ?? "");
        // Position the edit input at the click coordinates
        const container = sigma.getContainer();
        const rect = container.getBoundingClientRect();
        setEditingEdge({
          id: edge,
          predicate,
          x: event.x - rect.left,
          y: event.y - rect.top,
        });
        setEditValue(predicate);
      },
      clickStage: () => {
        setEditingEdge(null);
      },
    });
  }, [registerEvents, graph, sigma, selectedEntityTypeId, onEntityTypeSelect]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingEdge) inputRef.current?.select();
  }, [editingEdge]);

  async function commitEdit() {
    if (!editingEdge) return;
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== editingEdge.predicate) {
      await onUpdateRelationship(editingEdge.id, trimmed);
    }
    setEditingEdge(null);
  }

  function cancelEdit() {
    setEditingEdge(null);
  }

  if (!editingEdge) return null;

  return (
    <div
      style={{ left: editingEdge.x, top: editingEdge.y }}
      className="pointer-events-none absolute z-10"
    >
      <div className="pointer-events-auto -translate-x-1/2 -translate-y-full mb-1 flex items-center gap-1 rounded border border-primary bg-background p-1 shadow-md">
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void commitEdit(); }
            if (e.key === "Escape") cancelEdit();
          }}
          onBlur={() => void commitEdit()}
          className="h-6 min-w-[100px] rounded border border-border bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          style={{ width: `${Math.max(100, editValue.length * 7 + 24)}px` }}
        />
        <span className="text-[10px] text-muted-foreground">Enter</span>
      </div>
    </div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────

export function SchemaGraphCanvas({
  graph,
  selectedEntityTypeId,
  onEntityTypeSelect,
  onAddRelationship: _onAddRelationship,
  onUpdateRelationship,
  onDeleteRelationship: _onDeleteRelationship,
}: SchemaGraphCanvasProps) {
  const stableOnEntityTypeSelect = useCallback(onEntityTypeSelect, [onEntityTypeSelect]);

  if (graph.entityTypes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No entity types yet. Add them from the Entity Catalog below.
        </p>
      </div>
    );
  }

  return (
    <SigmaContainer
      graph={MultiDirectedGraph}
      settings={SIGMA_SETTINGS}
      className="h-full w-full"
      style={{ background: "transparent" }}
    >
      <GraphLoader
        graph={graph}
        selectedEntityTypeId={selectedEntityTypeId}
        onEntityTypeSelect={stableOnEntityTypeSelect}
        onUpdateRelationship={onUpdateRelationship}
      />
    </SigmaContainer>
  );
}
