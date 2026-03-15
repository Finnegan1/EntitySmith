import {
  Database,
  FileOutput,
  FolderOpen,
  GitFork,
  Inbox,
  Link,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppView } from "@/types";

interface WorkspaceAreaProps {
  activeView: AppView;
  projectName: string | null;
  onOpenProject: () => void;
  onNewProject: () => void;
  isLoading?: boolean;
}

export function WorkspaceArea({
  activeView,
  projectName,
  onOpenProject,
  onNewProject,
  isLoading = false,
}: WorkspaceAreaProps) {
  if (!projectName) {
    return <WelcomeScreen onOpen={onOpenProject} onNew={onNewProject} isLoading={isLoading} />;
  }

  return (
    <div className="flex h-full flex-col">
      <ViewHeader view={activeView} />
      <div className="flex-1 overflow-auto p-6">
        <EmptyViewState view={activeView} />
      </div>
    </div>
  );
}

// ── Welcome screen ────────────────────────────────────────────────────────────

function WelcomeScreen({
  onOpen,
  onNew,
  isLoading,
}: {
  onOpen: () => void;
  onNew: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          EntitySmith
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Build canonical knowledge graphs from structured and unstructured
          sources.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-[240px]">
        <Button onClick={onNew} className="w-full gap-2" disabled={isLoading}>
          <PlusCircle size={15} />
          New Project
        </Button>
        <Button variant="outline" onClick={onOpen} className="w-full gap-2" disabled={isLoading}>
          <FolderOpen size={15} />
          {isLoading ? "Opening…" : "Open Project"}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 w-full max-w-[480px]">
        {WORKFLOW_STEPS.map((step) => (
          <div
            key={step.label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
              {step.icon}
            </div>
            <p className="text-xs font-medium text-foreground">{step.label}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

const WORKFLOW_STEPS = [
  {
    label: "Register Sources",
    description: "SQLite, JSON, CSV, Markdown, PDF",
    icon: <Database size={14} />,
  },
  {
    label: "Build Schema Graph",
    description: "Canonical entity types and relationships",
    icon: <GitFork size={14} />,
  },
  {
    label: "Review Proposals",
    description: "Accept or reject system suggestions",
    icon: <Inbox size={14} />,
  },
  {
    label: "Export",
    description: "Turtle, JSON-LD, GraphML, Mermaid",
    icon: <FileOutput size={14} />,
  },
];

// ── View header ───────────────────────────────────────────────────────────────

const VIEW_META: Record<AppView, { title: string; description: string }> = {
  project: {
    title: "Project",
    description: "Project overview and settings",
  },
  sources: {
    title: "Sources",
    description: "Register and manage structured and unstructured data sources",
  },
  "schema-graph": {
    title: "Schema Graph",
    description: "Canonical entity types and their relationships",
  },
  proposals: {
    title: "Proposals",
    description: "System-generated relationship and schema proposals",
  },
  identity: {
    title: "Identity Resolution",
    description: "URI strategies, record linkage, and conflict policies",
  },
  export: {
    title: "Export",
    description: "Validate and export the knowledge graph",
  },
  settings: {
    title: "Settings",
    description: "Application and project preferences",
  },
};

function ViewHeader({ view }: { view: AppView }) {
  const meta = VIEW_META[view];
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{meta.title}</h2>
      </div>
    </div>
  );
}

// ── Empty states per view ─────────────────────────────────────────────────────

const VIEW_EMPTY: Record<
  AppView,
  { icon: React.ReactNode; message: string; detail: string }
> = {
  project: {
    icon: <FolderOpen size={28} />,
    message: "No project open",
    detail: "Create or open a project to get started.",
  },
  sources: {
    icon: <Database size={28} />,
    message: "No sources registered",
    detail: "Add a SQLite, JSON, or CSV file to begin profiling.",
  },
  "schema-graph": {
    icon: <GitFork size={28} />,
    message: "Schema graph is empty",
    detail:
      "Entity types will appear here once sources are profiled and proposals are accepted.",
  },
  proposals: {
    icon: <Inbox size={28} />,
    message: "No proposals yet",
    detail: "Run profiling on registered sources to generate proposals.",
  },
  identity: {
    icon: <Link size={28} />,
    message: "Identity resolution not configured",
    detail: "Define URI strategies and linkage rules per entity type.",
  },
  export: {
    icon: <FileOutput size={28} />,
    message: "Nothing to export",
    detail: "Complete schema graph authoring before exporting.",
  },
  settings: {
    icon: <Database size={28} />,
    message: "Settings",
    detail: "Configuration options will appear here.",
  },
};

function EmptyViewState({ view }: { view: AppView }) {
  const empty = VIEW_EMPTY[view];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="text-muted-foreground/40">{empty.icon}</div>
      <p className="text-sm font-medium text-foreground">{empty.message}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{empty.detail}</p>
    </div>
  );
}
