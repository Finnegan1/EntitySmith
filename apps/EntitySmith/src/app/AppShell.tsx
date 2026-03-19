import { useEffect, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { Sidebar } from "./Sidebar";
import { WorkspaceArea } from "./WorkspaceArea";
import { DetailsPanel } from "./DetailsPanel";
import { StatusBar } from "./StatusBar";
import { NewProjectModal } from "./NewProjectModal";
import { useProject } from "@/hooks/useProject";
import { useSchemaGraph } from "@/hooks/useSchemaGraph";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AppView, EntityTypeWithBindings, Proposal, SourceDescriptor } from "@/types";

export function AppShell() {
  const [activeView, setActiveView] = useState<AppView>("sources");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SourceDescriptor | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [selectedEntityType, setSelectedEntityType] = useState<EntityTypeWithBindings | null>(null);

  const { project, isLoading, error, clearError, createProject, openProject } =
    useProject();
  const { schemaGraph } = useSchemaGraph();

  // Close the new-project modal once a project has been successfully created.
  useEffect(() => {
    if (project !== null) setNewProjectOpen(false);
  }, [project]);

  // Clear selections when switching views.
  useEffect(() => {
    if (activeView !== "sources") setSelectedSource(null);
    if (activeView !== "connections") setSelectedProposal(null);
    if (activeView !== "schema-graph") setSelectedEntityType(null);
  }, [activeView]);

  function handleNewProject() {
    clearError();
    setNewProjectOpen(true);
  }

  async function handleOpenProject() {
    const selected = await openFileDialog({
      multiple: false,
      filters: [{ name: "EntitySmith Project", extensions: ["entitysmith"] }],
    });
    if (typeof selected === "string") {
      await openProject(selected);
    }
  }

  // The details panel is open when a project is loaded AND there is
  // something contextually relevant to show (e.g. a selected source).
  const showDetails = detailsOpen && project !== null;

  return (
    <TooltipProvider delayDuration={400}>
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeView={activeView}
          onViewChange={setActiveView}
          projectName={project?.name ?? null}
        />

        <main className="flex flex-1 flex-col overflow-hidden">
          <WorkspaceArea
            activeView={activeView}
            project={project}
            onOpenProject={handleOpenProject}
            onNewProject={handleNewProject}
            isLoading={isLoading}
            selectedSourceId={selectedSource?.id ?? null}
            onSourceSelect={setSelectedSource}
            selectedProposalId={selectedProposal?.id ?? null}
            onProposalSelect={setSelectedProposal}
            selectedEntityTypeId={selectedEntityType?.entityType.id ?? null}
            onEntityTypeSelect={setSelectedEntityType}
            schemaGraph={schemaGraph}
          />
        </main>

        {showDetails && (
          <DetailsPanel
            activeView={activeView}
            selectedSource={selectedSource}
            selectedProposal={selectedProposal}
            selectedEntityType={selectedEntityType}
            onClose={() => setDetailsOpen(false)}
          />
        )}
      </div>

      <StatusBar projectName={project?.name ?? null} />

      <NewProjectModal
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onConfirm={createProject}
        isLoading={isLoading}
        error={error}
      />
    </div>
    </TooltipProvider>
  );
}
