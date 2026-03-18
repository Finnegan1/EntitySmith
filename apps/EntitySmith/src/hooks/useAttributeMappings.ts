import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AttributeMapping } from "@/types";

export interface UseAttributeMappingsReturn {
  mappings: AttributeMapping[];
  isLoading: boolean;
  error: string | null;
  loadMappings: () => Promise<void>;
  upsertMapping: (params: {
    entityTypeId: string;
    sourceId: string;
    sourceColumn: string;
    canonicalName: string;
    rdfPredicate?: string;
    xsdDatatype?: string;
    isOmitted: boolean;
    sortOrder: number;
  }) => Promise<AttributeMapping>;
  deleteMapping: (id: string) => Promise<void>;
  autoGenerate: () => Promise<void>;
}

export function useAttributeMappings(
  entityTypeId: string | null,
): UseAttributeMappingsReturn {
  const [mappings, setMappings] = useState<AttributeMapping[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMappings = useCallback(async () => {
    if (!entityTypeId) {
      setMappings([]);
      return;
    }
    setIsLoading(true);
    try {
      const result = await invoke<AttributeMapping[]>("list_attribute_mappings", {
        entityTypeId,
      });
      setMappings(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [entityTypeId]);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  const upsertMapping = useCallback(
    async (params: {
      entityTypeId: string;
      sourceId: string;
      sourceColumn: string;
      canonicalName: string;
      rdfPredicate?: string;
      xsdDatatype?: string;
      isOmitted: boolean;
      sortOrder: number;
    }): Promise<AttributeMapping> => {
      const result = await invoke<AttributeMapping>("upsert_attribute_mapping", {
        entityTypeId: params.entityTypeId,
        sourceId: params.sourceId,
        sourceColumn: params.sourceColumn,
        canonicalName: params.canonicalName,
        rdfPredicate: params.rdfPredicate ?? null,
        xsdDatatype: params.xsdDatatype ?? null,
        isOmitted: params.isOmitted,
        sortOrder: params.sortOrder,
      });
      await loadMappings();
      return result;
    },
    [loadMappings],
  );

  const deleteMapping = useCallback(
    async (id: string) => {
      await invoke("delete_attribute_mapping", { id });
      await loadMappings();
    },
    [loadMappings],
  );

  const autoGenerate = useCallback(async () => {
    if (!entityTypeId) return;
    setIsLoading(true);
    try {
      await invoke<AttributeMapping[]>("auto_generate_attribute_mappings", {
        entityTypeId,
      });
      await loadMappings();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [entityTypeId, loadMappings]);

  return {
    mappings,
    isLoading,
    error,
    loadMappings,
    upsertMapping,
    deleteMapping,
    autoGenerate,
  };
}
