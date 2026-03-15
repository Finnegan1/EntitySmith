import { X } from "lucide-react";
import type { AppView } from "@/types";

interface DetailsPanelProps {
  activeView: AppView;
  onClose: () => void;
}

export function DetailsPanel({ activeView, onClose }: DetailsPanelProps) {
  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-l border-border bg-sidebar">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <p className="text-xs font-semibold text-sidebar-foreground">
          {PANEL_TITLE[activeView]}
        </p>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          {PANEL_EMPTY[activeView]}
        </p>
      </div>
    </aside>
  );
}

const PANEL_TITLE: Record<AppView, string> = {
  project: "Project Details",
  sources: "Source Details",
  "schema-graph": "Node Details",
  proposals: "Proposal Details",
  identity: "Linkage Details",
  export: "Export Preview",
  settings: "Info",
};

const PANEL_EMPTY: Record<AppView, string> = {
  project: "Select a project to view details.",
  sources: "Select a source to inspect its profile and attributes.",
  "schema-graph": "Select a node or edge to view details.",
  proposals: "Select a proposal to view evidence and provenance.",
  identity: "Select an entity type to configure identity resolution.",
  export: "Configure export settings to preview the output.",
  settings: "",
};
