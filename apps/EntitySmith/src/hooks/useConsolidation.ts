import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  ConsolidationDecision,
  EntityComparisonData,
  EntitySimilarityPair,
} from "@/types";

export interface UseConsolidationReturn {
  similarityPairs: EntitySimilarityPair[];
  decisions: ConsolidationDecision[];
  isLoading: boolean;
  isComputing: boolean;
  error: string | null;
  pendingCount: number;
  computeSimilarities: () => Promise<void>;
  getComparison: (
    entityASourceId: string,
    entityAName: string,
    entityBSourceId: string,
    entityBName: string,
  ) => Promise<EntityComparisonData>;
  executeMerge: (
    canonicalName: string,
    entityASourceId: string,
    entityAName: string,
    entityBSourceId: string,
    entityBName: string,
    attributeMapping: Record<string, unknown>,
  ) => Promise<ConsolidationDecision>;
  executeLink: (
    entityASourceId: string,
    entityAName: string,
    entityBSourceId: string,
    entityBName: string,
    predicate: string,
    reversed: boolean,
  ) => Promise<ConsolidationDecision>;
  executeSubtype: (
    parentSourceId: string,
    parentEntityName: string,
    childSourceId: string,
    childEntityName: string,
  ) => Promise<ConsolidationDecision>;
  keepSeparate: (
    entityASourceId: string,
    entityAName: string,
    entityBSourceId: string,
    entityBName: string,
  ) => Promise<ConsolidationDecision>;
  listDecisions: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useConsolidation(): UseConsolidationReturn {
  const [similarityPairs, setSimilarityPairs] = useState<EntitySimilarityPair[]>([]);
  const [decisions, setDecisions] = useState<ConsolidationDecision[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPairs = useCallback(async () => {
    try {
      const pairs = await invoke<EntitySimilarityPair[]>("list_entity_similarity_pairs", {
        statusFilter: null,
      });
      setSimilarityPairs(pairs);
    } catch (e) {
      // Ignore if no project open.
    }
  }, []);

  const loadDecisions = useCallback(async () => {
    try {
      const decs = await invoke<ConsolidationDecision[]>("list_consolidation_decisions");
      setDecisions(decs);
    } catch (e) {
      // Ignore if no project open.
    }
  }, []);

  const reload = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([loadPairs(), loadDecisions()]);
    setIsLoading(false);
  }, [loadPairs, loadDecisions]);

  // Auto-load on mount.
  useEffect(() => {
    reload();
  }, [reload]);

  // Listen for consolidation updates.
  useEffect(() => {
    const unlisten = listen("consolidation:updated", () => {
      reload();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [reload]);

  // Also reload on schema updates (merges affect schema).
  useEffect(() => {
    const unlisten = listen("schema:updated", () => {
      reload();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [reload]);

  const computeSimilarities = useCallback(async () => {
    setIsComputing(true);
    setError(null);
    try {
      const pairs = await invoke<EntitySimilarityPair[]>("compute_entity_similarities");
      setSimilarityPairs(pairs);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsComputing(false);
    }
  }, []);

  const getComparison = useCallback(
    async (
      entityASourceId: string,
      entityAName: string,
      entityBSourceId: string,
      entityBName: string,
    ): Promise<EntityComparisonData> => {
      return invoke<EntityComparisonData>("get_entity_comparison", {
        entityASourceId,
        entityAName,
        entityBSourceId,
        entityBName,
      });
    },
    [],
  );

  const executeMerge = useCallback(
    async (
      canonicalName: string,
      entityASourceId: string,
      entityAName: string,
      entityBSourceId: string,
      entityBName: string,
      attributeMapping: Record<string, unknown>,
    ): Promise<ConsolidationDecision> => {
      return invoke<ConsolidationDecision>("execute_merge", {
        canonicalName,
        entityASourceId,
        entityAName,
        entityBSourceId,
        entityBName,
        attributeMapping,
      });
    },
    [],
  );

  const executeLink = useCallback(
    async (
      entityASourceId: string,
      entityAName: string,
      entityBSourceId: string,
      entityBName: string,
      predicate: string,
      reversed: boolean,
    ): Promise<ConsolidationDecision> => {
      return invoke<ConsolidationDecision>("execute_link", {
        entityASourceId,
        entityAName,
        entityBSourceId,
        entityBName,
        predicate,
        reversed,
      });
    },
    [],
  );

  const executeSubtype = useCallback(
    async (
      parentSourceId: string,
      parentEntityName: string,
      childSourceId: string,
      childEntityName: string,
    ): Promise<ConsolidationDecision> => {
      return invoke<ConsolidationDecision>("execute_subtype", {
        parentSourceId,
        parentEntityName,
        childSourceId,
        childEntityName,
      });
    },
    [],
  );

  const keepSeparate = useCallback(
    async (
      entityASourceId: string,
      entityAName: string,
      entityBSourceId: string,
      entityBName: string,
    ): Promise<ConsolidationDecision> => {
      return invoke<ConsolidationDecision>("execute_keep_separate", {
        entityASourceId,
        entityAName,
        entityBSourceId,
        entityBName,
      });
    },
    [],
  );

  const pendingCount = similarityPairs.filter((p) => p.status === "pending").length;

  return {
    similarityPairs,
    decisions,
    isLoading,
    isComputing,
    error,
    pendingCount,
    computeSimilarities,
    getComparison,
    executeMerge,
    executeLink,
    executeSubtype,
    keepSeparate,
    listDecisions: loadDecisions,
    reload,
  };
}
