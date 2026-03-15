import { Circle } from "lucide-react";
import { usePing } from "@/hooks/usePing";

interface StatusBarProps {
  projectName: string | null;
}

export function StatusBar({ projectName }: StatusBarProps) {
  const { response, error } = usePing();

  const backendStatus = error ? "error" : response ? "ok" : "connecting";

  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-muted/30 px-3">
      <div className="flex items-center gap-3">
        <StatusIndicator status={backendStatus} />
        {projectName && (
          <span className="text-[11px] text-muted-foreground">
            {projectName}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {response && (
          <span className="text-[11px] text-muted-foreground">
            v{response.version}
          </span>
        )}
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: "ok" | "error" | "connecting" }) {
  const label = {
    ok: "Backend connected",
    error: "Backend unavailable",
    connecting: "Connecting…",
  }[status];

  const color = {
    ok: "text-green-500",
    error: "text-destructive",
    connecting: "text-muted-foreground",
  }[status];

  return (
    <span className={`flex items-center gap-1 text-[11px] ${color}`}>
      <Circle size={6} fill="currentColor" stroke="none" />
      {label}
    </span>
  );
}
