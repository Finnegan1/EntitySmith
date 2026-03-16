import { Loader2, CheckCircle2, XCircle, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useJobs } from "@/hooks/useJobs";
import type { JobStatus } from "@/types";

/// Status-bar widget that shows running / recently completed jobs.
/// Clicking it expands a small job history popover.
export function JobsIndicator() {
  const { jobs, runningCount, failedCount } = useJobs();
  const [open, setOpen] = useState(false);

  const recentJobs = jobs.slice(0, 8);

  if (jobs.length === 0) return null;

  return (
    <div className="relative">
      {/* Popover */}
      {open && (
        <div className="absolute bottom-full right-0 mb-1 w-72 rounded-md border border-border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <p className="text-[11px] font-semibold text-popover-foreground">
              Jobs
            </p>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronUp size={13} />
            </button>
          </div>
          <ul className="max-h-48 overflow-y-auto divide-y divide-border">
            {recentJobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        </div>
      )}

      {/* Pill button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] transition-colors",
          open
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {runningCount > 0 ? (
          <>
            <Loader2 size={11} className="animate-spin text-primary" />
            <span>{runningCount} running</span>
          </>
        ) : failedCount > 0 ? (
          <>
            <XCircle size={11} className="text-destructive" />
            <span className="text-destructive">{failedCount} failed</span>
          </>
        ) : (
          <>
            <CheckCircle2 size={11} className="text-green-600" />
            <span>Jobs</span>
          </>
        )}
      </button>
    </div>
  );
}

function JobRow({ job }: { job: JobStatus }) {
  return (
    <li className="flex items-center gap-2 px-3 py-1.5">
      <JobIcon status={job.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] text-foreground">
          {JOB_KIND_LABEL[job.kind] ?? job.kind}
        </p>
        {job.message && job.status === "failed" && (
          <p className="truncate text-[10px] text-destructive">{job.message}</p>
        )}
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {formatRelative(job.updatedAt)}
      </span>
    </li>
  );
}

function JobIcon({ status }: { status: JobStatus["status"] }) {
  switch (status) {
    case "queued":
      return <Loader2 size={12} className="shrink-0 text-muted-foreground" />;
    case "running":
      return <Loader2 size={12} className="shrink-0 animate-spin text-primary" />;
    case "completed":
      return <CheckCircle2 size={12} className="shrink-0 text-green-600" />;
    case "failed":
      return <XCircle size={12} className="shrink-0 text-destructive" />;
    case "canceled":
      return <XCircle size={12} className="shrink-0 text-muted-foreground" />;
  }
}

const JOB_KIND_LABEL: Record<string, string> = {
  profile_source: "Profile source",
};

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 5_000) return "just now";
    if (diff < 60_000) return `${Math.floor(diff / 1_000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    return `${Math.floor(diff / 3_600_000)}h ago`;
  } catch {
    return "";
  }
}
