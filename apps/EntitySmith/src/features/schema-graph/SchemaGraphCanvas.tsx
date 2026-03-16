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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { EntityTypeNode, type EntityTypeNodeData, type EntityTypeNodeType } from "./EntityTypeNode";
import type { EntityTypeWithBindings, SchemaGraph } from "@/types";

const nodeTypes = { entityType: EntityTypeNode };

interface SchemaGraphCanvasProps {
  graph: SchemaGraph;
  selectedEntityTypeId: string | null;
  onEntityTypeSelect: (et: EntityTypeWithBindings | null) => void;
  onAddRelationship: (sourceId: string, targetId: string, predicate: string) => Promise<void>;
  onDeleteRelationship: (id: string) => Promise<void>;
}

function buildLayout(entityTypes: EntityTypeWithBindings[]): { x: number; y: number }[] {
  // Simple grid layout: 3 columns, 280px apart
  return entityTypes.map((_, i) => ({
    x: (i % 3) * 280 + 40,
    y: Math.floor(i / 3) * 180 + 40,
  }));
}

export function SchemaGraphCanvas({
  graph,
  selectedEntityTypeId,
  onEntityTypeSelect,
  onAddRelationship,
  onDeleteRelationship: _onDeleteRelationship,
}: SchemaGraphCanvasProps) {
  const positions = useMemo(() => buildLayout(graph.entityTypes), [graph.entityTypes]);

  const initialNodes: EntityTypeNodeType[] = useMemo(
    () =>
      graph.entityTypes.map((et, i) => ({
        id: et.entityType.id,
        type: "entityType" as const,
        position: positions[i],
        data: et as EntityTypeNodeData,
        selected: et.entityType.id === selectedEntityTypeId,
      })),
    [graph.entityTypes, positions, selectedEntityTypeId],
  );

  const initialEdges: Edge[] = useMemo(
    () =>
      graph.relationships.map((r) => ({
        id: r.id,
        source: r.sourceEntityTypeId,
        target: r.targetEntityTypeId,
        label: r.predicate,
        labelStyle: { fontSize: 10 },
        style: { strokeWidth: 1.5 },
        type: "smoothstep",
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
      className="bg-background"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!opacity-20" />
      <Controls className="[&_button]:bg-card [&_button]:border-border" />
      <MiniMap className="!bg-card !border-border" nodeColor="#6366f1" />
    </ReactFlow>
  );
}
