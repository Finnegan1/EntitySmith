import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  EntityTypeJoinKey,
  EntityTypeJoinPlan,
  EntityTypeJoinStep,
  JoinType,
} from "@/types";

export function useJoinPlan(entityTypeId: string | null) {
  const [plan, setPlan] = useState<EntityTypeJoinPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!entityTypeId) {
      setPlan(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const p = await invoke<EntityTypeJoinPlan>("get_join_plan", { entityTypeId });
      setPlan(p);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [entityTypeId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unlisten = listen("schema:updated", () => {
      load();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [load]);

  const addStep = useCallback(
    async (sourceId: string, entityName: string, joinType: JoinType = "left") => {
      if (!entityTypeId) return;
      const stepOrder = plan ? plan.steps.length : 0;
      await invoke<EntityTypeJoinStep>("add_join_step", {
        entityTypeId,
        stepOrder,
        sourceId,
        entityName,
        joinType,
      });
      await load();
    },
    [entityTypeId, plan, load],
  );

  const removeStep = useCallback(
    async (stepId: string) => {
      await invoke<void>("remove_join_step", { stepId });
      await load();
    },
    [load],
  );

  const reorderSteps = useCallback(
    async (orderedStepIds: string[]) => {
      if (!entityTypeId) return;
      await invoke<void>("reorder_join_steps", { entityTypeId, orderedStepIds });
      await load();
    },
    [entityTypeId, load],
  );

  const updateStepType = useCallback(
    async (stepId: string, joinType: JoinType) => {
      await invoke<void>("update_join_step_type", { stepId, joinType });
      await load();
    },
    [load],
  );

  const setJoinKeys = useCallback(
    async (joinStepId: string, keys: [string, string][]) => {
      await invoke<EntityTypeJoinKey[]>("set_join_keys", { joinStepId, keys });
      await load();
    },
    [load],
  );

  return {
    plan,
    isLoading,
    error,
    addStep,
    removeStep,
    reorderSteps,
    updateStepType,
    setJoinKeys,
    reload: load,
  };
}
