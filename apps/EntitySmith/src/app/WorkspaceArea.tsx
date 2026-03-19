import {
  Boxes,
  Cable,
  Database,
  FileOutput,
  FolderOpen,
  GitFork,
  Link,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourcesView } from "@/features/sources/SourcesView";
import { ProposalsView } from "@/features/proposals/ProposalsView";
import { SchemaGraphView } from "@/features/schema-graph";
import { EntitiesView } from "@/features/consolidation/EntitiesView";
import type { AppView, EntityTypeWithBindings, Proposal, ProjectState, SchemaGraph, SourceDescriptor } from "@/types";

interface WorkspaceAreaProps {
  activeView: AppView;
  project: ProjectState | null;
  onOpenProject: () => void;
  onNewProject: () => void;
  isLoading?: boolean;
  selectedSourceId: string | null;
  onSourceSelect: (source: SourceDescriptor | null) => void;
  selectedProposalId: string | null;
  onProposalSelect: (proposal: Proposal | null) => void;
  selectedEntityTypeId: string | null;
  onEntityTypeSelect: (et: EntityTypeWithBindings | null) => void;
  schemaGraph: SchemaGraph | null;
}

export function WorkspaceArea({
  activeView,
  project,
  onOpenProject,
  onNewProject,
  isLoading = false,
  selectedSourceId,
  onSourceSelect,
  selectedProposalId,
  onProposalSelect,
  selectedEntityTypeId,
  onEntityTypeSelect,
  schemaGraph,
}: WorkspaceAreaProps) {
  if (!project) {
    return (
      <WelcomeScreen
        onOpen={onOpenProject}
        onNew={onNewProject}
        isLoading={isLoading}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ViewHeader view={activeView} />
      <div className="flex-1 overflow-hidden">
        {activeView === "sources" ? (
          <SourcesView
            projectId={project.id}
            selectedSourceId={selectedSourceId}
            onSourceSelect={onSourceSelect}
          />
        ) : activeView === "entities" ? (
          <EntitiesView schemaGraph={schemaGraph} />
        ) : activeView === "schema-graph" ? (
          <SchemaGraphView
            projectId={project.id}
            selectedEntityTypeId={selectedEntityTypeId}
            onEntityTypeSelect={onEntityTypeSelect}
          />
        ) : activeView === "connections" ? (
          <ProposalsView
            projectId={project.id}
            selectedProposalId={selectedProposalId}
            onProposalSelect={onProposalSelect}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyViewState view={activeView} />
          </div>
        )}
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

      <div className="flex w-full max-w-[240px] flex-col gap-3">
        <Button
          onClick={onNew}
          className="w-full gap-2"
          disabled={isLoading}
        >
          <PlusCircle size={15} />
          New Project
        </Button>
        <Button
          variant="outline"
          onClick={onOpen}
          className="w-full gap-2"
          disabled={isLoading}
        >
          <FolderOpen size={15} />
          {isLoading ? "Opening…" : "Open Project"}
        </Button>
      </div>

      <div className="mt-4 grid w-full max-w-[480px] grid-cols-2 gap-3">
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
    label: "Define Entities",
    description: "Merge and consolidate source tables",
    icon: <Boxes size={14} />,
  },
  {
    label: "Define Connections",
    description: "Accept or reject detected relationships",
    icon: <Cable size={14} />,
  },
  {
    label: "Export",
    description: "Turtle, JSON-LD, GraphML, Mermaid",
    icon: <FileOutput size={14} />,
  },
];

// ── View header ───────────────────────────────────────────────────────────────

const VIEW_META: Record<AppView, { title: string }> = {
  project: { title: "Project" },
  sources: { title: "Sources" },
  entities: { title: "Entities" },
  "schema-graph": { title: "Schema Graph" },
  connections: { title: "Connections" },
  identity: { title: "Identity Resolution" },
  export: { title: "Export" },
  settings: { title: "Settings" },
};

function ViewHeader({ view }: { view: AppView }) {
  return (
    <div className="flex h-12 shrink-0 items-center border-b border-border px-5">
      <h2 className="text-sm font-semibold text-foreground">
        {VIEW_META[view].title}
      </h2>
    </div>
  );
}

// ── Empty states ──────────────────────────────────────────────────────────────

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
  entities: {
    icon: <Boxes size={28} />,
    message: "No entities yet",
    detail: "Profile sources and compute similarities to define entity types.",
  },
  "schema-graph": {
    icon: <GitFork size={28} />,
    message: "Schema graph is empty",
    detail: "Entity types appear here once you define them in the Entities step.",
  },
  connections: {
    icon: <Cable size={28} />,
    message: "No connections yet",
    detail: "Run analysis to detect relationships between entity types.",
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
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="text-muted-foreground/40">{empty.icon}</div>
      <p className="text-sm font-medium text-foreground">{empty.message}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{empty.detail}</p>
    </div>
  );
}
