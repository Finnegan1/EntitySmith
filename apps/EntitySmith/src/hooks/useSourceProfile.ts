import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FullSourceProfile, SourceProfileSummary } from "@/types";

interface UseSourceProfileReturn {
  profile: FullSourceProfile | null;
  summary: SourceProfileSummary | null;
  isLoading: boolean;
  error: string | null;
  profileSource: (sourceId: string) => Promise<SourceProfileSummary | null>;
  loadProfile: (sourceId: string) => Promise<void>;
  clearError: () => void;
}

export function useSourceProfile(): UseSourceProfileReturn {
  const [profile, setProfile] = useState<FullSourceProfile | null>(null);
  const [summary, setSummary] = useState<SourceProfileSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profileSource = useCallback(
    async (sourceId: string): Promise<SourceProfileSummary | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await invoke<SourceProfileSummary>("profile_source", {
          sourceId,
        });
        setSummary(result);
        return result;
      } catch (e) {
        setError(String(e));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const loadProfile = useCallback(async (sourceId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<FullSourceProfile | null>(
        "get_source_profile",
        { sourceId },
      );
      setProfile(result);
      if (result) {
        setSummary(result.summary);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { profile, summary, isLoading, error, profileSource, loadProfile, clearError };
}
