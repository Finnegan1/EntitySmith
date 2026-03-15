import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";
import type { ProjectState } from "@/types";

export interface UseProjectReturn {
  project: ProjectState | null;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  createProject: (name: string, directory: string) => Promise<void>;
  openProject: (path: string) => Promise<void>;
  closeProject: () => Promise<void>;
}

export function useProject(): UseProjectReturn {
  const [project, setProject] = useState<ProjectState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const createProject = useCallback(
    async (name: string, directory: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const state = await invoke<ProjectState>("create_project", {
          name,
          directory,
        });
        setProject(state);
      } catch (e) {
        setError(typeof e === "string" ? e : String(e));
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const openProject = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const state = await invoke<ProjectState>("open_project", { path });
      setProject(state);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const closeProject = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await invoke("close_project");
      setProject(null);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    project,
    isLoading,
    error,
    clearError,
    createProject,
    openProject,
    closeProject,
  };
}
