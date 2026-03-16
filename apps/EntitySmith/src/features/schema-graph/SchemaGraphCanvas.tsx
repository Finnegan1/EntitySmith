import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Edge,
  type Connection,
  BackgroundVariant,
  MarkerType,
  Position,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import { EntityTypeNode, type EntityTypeNodeData, type EntityTypeNodeType } from "./EntityTypeNode";
import type { EntityTypeWithBindings, SchemaGraph } from "@/types";

const nodeTypes = { entityType: EntityTypeNode };

const NODE_WIDTH = 220;
const NODE_HEIGHT = 100; // used by dagre for spacing; nodes with bindings are taller

function buildDagreLayout(
  entityTypes: EntityTypeWithBindings[],
  relationships: SchemaGraph["relationships"],
): Map<string, { x: number; y: number; sourcePosition: Position; targetPosition: Position }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    nodesep: 100,  // vertical gap between nodes in the same rank
    ranksep: 220,  // horizontal gap between ranks
    edgesep: 40,   // minimum gap between edges
    marginx: 60,
    marginy: 60,
  });

  for (const et of entityTypes) {
    g.setNode(et.entityType.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const rel of relationships) {
    g.setEdge(rel.sourceEntityTypeId, rel.targetEntityTypeId);
  }

  dagre.layout(g);

  const positions = new Map<
    string,
    { x: number; y: number; sourcePosition: Position; targetPosition: Position }
  >();

  for (const et of entityTypes) {
    const node = g.node(et.entityType.id);
    if (node) {
      positions.set(et.entityType.id, {
        x: node.x - NODE_WIDTH / 2,
        y: node.y - NODE_HEIGHT / 2,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
    }
  }

  return positions;
}

interface SchemaGraphCanvasProps {
  graph: SchemaGraph;
  selectedEntityTypeId: string | null;
  onEntityTypeSelect: (et: EntityTypeWithBindings | null) => void;
  onAddRelationship: (sourceId: string, targetId: string, predicate: string) => Promise<void>;
  onDeleteRelationship: (id: string) => Promise<void>;
}

export function SchemaGraphCanvas({
  graph,
  selectedEntityTypeId,
  onEntityTypeSelect,
  onAddRelationship,
  onDeleteRelationship: _onDeleteRelationship,
}: SchemaGraphCanvasProps) {
  const positions = useMemo(
    () => buildDagreLayout(graph.entityTypes, graph.relationships),
    [graph.entityTypes, graph.relationships],
  );

  const initialNodes: EntityTypeNodeType[] = useMemo(
    () =>
      graph.entityTypes.map((et) => {
        const pos = positions.get(et.entityType.id) ?? { x: 0, y: 0, sourcePosition: Position.Right, targetPosition: Position.Left };
        return {
          id: et.entityType.id,
          type: "entityType" as const,
          position: { x: pos.x, y: pos.y },
          sourcePosition: pos.sourcePosition,
          targetPosition: pos.targetPosition,
          data: et as EntityTypeNodeData,
          selected: et.entityType.id === selectedEntityTypeId,
        };
      }),
    [graph.entityTypes, positions, selectedEntityTypeId],
  );

  const initialEdges: Edge[] = useMemo(
    () =>
      graph.relationships.map((r) => ({
        id: r.id,
        source: r.sourceEntityTypeId,
        target: r.targetEntityTypeId,
        label: r.predicate,
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: "#ffffff", stroke: "#e2e8f0", strokeWidth: 1 },
        labelStyle: { fontSize: 11, fontWeight: 500, fill: "#1e293b" },
        style: { strokeWidth: 1.5, stroke: "#94a3b8" },
        type: "bezier",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: "#94a3b8",
        },
      })),
    [graph.relationships],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<EntityTypeNodeType>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when graph changes
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      await onAddRelationship(connection.source, connection.target, "relatedTo");
    },
    [onAddRelationship],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: EntityTypeNodeType) => {
      const isAlreadySelected = node.id === selectedEntityTypeId;
      onEntityTypeSelect(isAlreadySelected ? null : (node.data as EntityTypeNodeData));
    },
    [onEntityTypeSelect, selectedEntityTypeId],
  );

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
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      className="bg-background"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!opacity-20" />
      <Controls className="[&_button]:bg-card [&_button]:border-border" />
      <MiniMap className="!bg-card !border-border" nodeColor="#0f7a8c" />
    </ReactFlow>
  );
}
