import {
  Database,
  FileOutput,
  GitFork,
  Inbox,
  Link,
  Settings,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppView } from "@/types";

interface NavItem {
  view: AppView;
  label: string;
  icon: React.ReactNode;
  group: "main" | "bottom";
  tip: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    view: "sources",
    label: "Sources",
    icon: <Database size={16} />,
    group: "main",
    tip: "Register your data sources: SQLite files, CSVs, JSON files, Markdown folders, PDFs, and URLs. Profiling runs automatically when a structured source is added, detecting column types, row counts, and foreign key candidates.",
  },
  {
    view: "schema-graph",
    label: "Schema Graph",
    icon: <GitFork size={16} />,
    group: "main",
    tip: "Build the canonical schema: entity types (e.g. User, Order) as nodes and named relationships as edges. Bind discovered source entities to canonical types here. This graph defines the structure of your exported knowledge graph.",
  },
  {
    view: "proposals",
    label: "Proposals",
    icon: <Inbox size={16} />,
    group: "main",
    tip: "Review connection proposals generated from your sources. The analysis engine detects foreign keys, column-name patterns, and shared sample values to suggest relationships between entities. Accept, modify, or reject each proposal.",
  },
  {
    view: "consolidation",
    label: "Consolidation",
    icon: <Layers size={16} />,
    group: "main",
    tip: "Identify and resolve similar entities across sources. Merge duplicates, link related entities, define subtype hierarchies, or keep them separate. Map source attributes to canonical RDF predicates.",
  },
  {
    view: "identity",
    label: "Identity",
    icon: <Link size={16} />,
    group: "main",
    tip: "Configure how records from different sources that represent the same real-world entity are linked. Set URI minting strategies (how stable identifiers are generated) and conflict policies (what to do when sources disagree on a value).",
  },
  {
    view: "export",
    label: "Export",
    icon: <FileOutput size={16} />,
    group: "main",
    tip: "Validate the graph and export it as RDF/Turtle, JSON-LD, GraphML, or Mermaid. Choose schema-only (OWL classes and properties) or a full export that streams all instance data lazily from your sources.",
  },
  {
    view: "settings",
    label: "Settings",
    icon: <Settings size={16} />,
    group: "bottom",
    tip: "Configure API keys, embedding mode, and other app-level settings.",
  },
];

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  projectName: string | null;
}

export function Sidebar({ activeView, onViewChange, projectName }: SidebarProps) {
  const mainItems = NAV_ITEMS.filter((i) => i.group === "main");
  const bottomItems = NAV_ITEMS.filter((i) => i.group === "bottom");

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Project header */}
      <div className="flex h-12 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary">
          <Layers size={13} className="text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-sidebar-foreground">
            EntitySmith
          </p>
          {projectName && (
            <p className="truncate text-[10px] text-muted-foreground">
              {projectName}
            </p>
          )}
        </div>
      </div>

      {/* Main navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        <p className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        {mainItems.map((item) => (
          <NavButton
            key={item.view}
            item={item}
            isActive={activeView === item.view}
            onClick={() => onViewChange(item.view)}
          />
        ))}
      </nav>

      {/* Bottom items */}
      <div className="flex flex-col gap-0.5 border-t border-border p-2">
        {bottomItems.map((item) => (
          <NavButton
            key={item.view}
            item={item}
            isActive={activeView === item.view}
            onClick={() => onViewChange(item.view)}
          />
        ))}
      </div>
    </aside>
  );
}

interface NavButtonProps {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}

function NavButton({ item, isActive, onClick }: NavButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
          )}
        >
          <span className="shrink-0 opacity-70">{item.icon}</span>
          {item.label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p className="max-w-[240px]">{item.tip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
