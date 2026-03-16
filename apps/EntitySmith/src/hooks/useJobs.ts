import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { JobStatus } from "@/types";

interface UseJobsReturn {
  jobs: JobStatus[];
  runningCount: number;
  failedCount: number;
}

/// Subscribe to `job:update` events and maintain a live list of jobs
/// for the current session.  Loads the initial list from the backend
/// on mount so the indicator survives a component remount.
export function useJobs(): UseJobsReturn {
  const [jobs, setJobs] = useState<JobStatus[]>([]);

  useEffect(() => {
    // Load existing jobs (populated if component mounts after some jobs ran).
    invoke<JobStatus[]>("list_jobs")
      .then(setJobs)
      .catch(() => {/* no project open yet */});

    let unlisten: UnlistenFn | undefined;

    listen<JobStatus>("job:update", (event) => {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === event.payload.id);
        if (idx === -1) return [event.payload, ...prev];
        const next = [...prev];
        next[idx] = event.payload;
        return next;
      });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const runningCount = jobs.filter(
    (j) => j.status === "running" || j.status === "queued",
  ).length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  return { jobs, runningCount, failedCount };
}
