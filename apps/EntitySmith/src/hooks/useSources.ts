import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import type { SourceDescriptor } from "@/types";

export interface UseSourcesReturn {
  sources: SourceDescriptor[];
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
  addSource: (name: string, kind: string, path?: string) => Promise<SourceDescriptor | null>;
  removeSource: (sourceId: string) => Promise<void>;
}

export function useSources(projectId: string | undefined): UseSourcesReturn {
  const [sources, setSources] = useState<SourceDescriptor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setSources([]);
      return;
    }
    setIsLoading(true);
    try {
      const list = await invoke<SourceDescriptor[]>("list_sources");
      setSources(list);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Load sources whenever the open project changes.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const addSource = useCallback(
    async (name: string, kind: string, path?: string): Promise<SourceDescriptor | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const descriptor = await invoke<SourceDescriptor>("add_source", {
          name,
          kind,
          path: path ?? null,
        });
        setSources((prev) => [...prev, descriptor]);
        return descriptor;
      } catch (e) {
        setError(typeof e === "string" ? e : String(e));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const removeSource = useCallback(async (sourceId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await invoke("remove_source", { sourceId });
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { sources, isLoading, error, clearError, refresh, addSource, removeSource };
}
