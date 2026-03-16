import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { FullSourceProfile, SourceProfileSummary } from "@/types";

interface UseSourceProfileReturn {
  profile: FullSourceProfile | null;
  summary: SourceProfileSummary | null;
  isLoading: boolean;
  error: string | null;
  profileSource: (sourceId: string) => Promise<void>;
  loadProfile: (sourceId: string) => Promise<void>;
  clearError: () => void;
}

export function useSourceProfile(watchSourceId?: string): UseSourceProfileReturn {
  const [profile, setProfile] = useState<FullSourceProfile | null>(null);
  const [summary, setSummary] = useState<SourceProfileSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to `profile:updated` events so the panel refreshes automatically
  // when the background job completes for the source we are watching.
  const watchRef = useRef(watchSourceId);
  watchRef.current = watchSourceId;

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    listen<string>("profile:updated", (event) => {
      if (event.payload === watchRef.current) {
        // Re-load the profile from the store without showing a loading spinner
        // (the job indicator already communicates progress).
        invoke<FullSourceProfile | null>("get_source_profile", {
          sourceId: event.payload,
        })
          .then((result) => {
            setProfile(result);
            if (result) setSummary(result.summary);
          })
          .catch(() => {/* ignore — stale source */});
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []); // mount/unmount only; watchRef tracks current sourceId

  const profileSource = useCallback(async (sourceId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      // Returns job ID — actual result arrives via profile:updated event.
      await invoke<string>("profile_source", { sourceId });
    } catch (e) {
      setError(String(e));
      setIsLoading(false);
      return;
    }
    // Keep isLoading true until the profile:updated event arrives or the
    // job:update event reports completion/failure (handled in DetailsPanel
    // via the useJobs hook).  We clear it here optimistically after a short
    // delay so the button doesn't spin forever if the event is missed.
    setTimeout(() => setIsLoading(false), 500);
  }, []);

  const loadProfile = useCallback(async (sourceId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<FullSourceProfile | null>("get_source_profile", {
        sourceId,
      });
      setProfile(result);
      if (result) setSummary(result.summary);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { profile, summary, isLoading, error, profileSource, loadProfile, clearError };
}
