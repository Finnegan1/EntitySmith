import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  EntitySourceBinding,
  EntityType,
  Relationship,
  SchemaGraph,
  SourceEntitySummary,
} from "@/types";

export function useSchemaGraph() {
  const [schemaGraph, setSchemaGraph] = useState<SchemaGraph | null>(null);
  const [sourceEntities, setSourceEntities] = useState<SourceEntitySummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSchemaGraph = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [graph, entities] = await Promise.all([
        invoke<SchemaGraph>("get_schema_graph"),
        invoke<SourceEntitySummary[]>("list_source_entities_summary"),
      ]);
      setSchemaGraph(graph);
      setSourceEntities(entities);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Listen for schema:updated events
  useEffect(() => {
    const unlisten = listen("schema:updated", () => loadSchemaGraph());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadSchemaGraph]);

  const createEntityType = useCallback(
    async (name: string, label?: string, description?: string): Promise<EntityType> => {
      const et = await invoke<EntityType>("create_entity_type", { name, label, description });
      await loadSchemaGraph();
      return et;
    },
    [loadSchemaGraph],
  );

  const deleteEntityType = useCallback(
    async (id: string) => {
      await invoke("delete_entity_type", { id });
      await loadSchemaGraph();
    },
    [loadSchemaGraph],
  );

  const addRelationship = useCallback(
    async (
      sourceEntityTypeId: string,
      targetEntityTypeId: string,
      predicate: string,
      cardinality?: string,
    ): Promise<Relationship> => {
      const rel = await invoke<Relationship>("add_relationship", {
        sourceEntityTypeId,
        targetEntityTypeId,
        predicate,
        cardinality,
      });
      await loadSchemaGraph();
      return rel;
    },
    [loadSchemaGraph],
  );

  const deleteRelationship = useCallback(
    async (id: string) => {
      await invoke("delete_relationship", { id });
      await loadSchemaGraph();
    },
    [loadSchemaGraph],
  );

  const bindSourceEntity = useCallback(
    async (
      entityTypeId: string,
      sourceId: string,
      entityName: string,
    ): Promise<EntitySourceBinding> => {
      const b = await invoke<EntitySourceBinding>("bind_source_entity", {
        entityTypeId,
        sourceId,
        entityName,
      });
      await loadSchemaGraph();
      return b;
    },
    [loadSchemaGraph],
  );

  const unbindSourceEntity = useCallback(
    async (entityTypeId: string, sourceId: string, entityName: string) => {
      await invoke("unbind_source_entity", { entityTypeId, sourceId, entityName });
      await loadSchemaGraph();
    },
    [loadSchemaGraph],
  );

  const promoteProposal = useCallback(
    async (proposalId: string) => {
      await invoke("promote_proposal", { proposalId });
      await loadSchemaGraph();
    },
    [loadSchemaGraph],
  );

  return {
    schemaGraph,
    sourceEntities,
    isLoading,
    error,
    loadSchemaGraph,
    createEntityType,
    deleteEntityType,
    addRelationship,
    deleteRelationship,
    bindSourceEntity,
    unbindSourceEntity,
    promoteProposal,
  };
}
