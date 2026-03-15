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
import type { AppView } from "@/types";

interface NavItem {
  view: AppView;
  label: string;
  icon: React.ReactNode;
  group: "main" | "bottom";
}

const NAV_ITEMS: NavItem[] = [
  {
    view: "sources",
    label: "Sources",
    icon: <Database size={16} />,
    group: "main",
  },
  {
    view: "schema-graph",
    label: "Schema Graph",
    icon: <GitFork size={16} />,
    group: "main",
  },
  {
    view: "proposals",
    label: "Proposals",
    icon: <Inbox size={16} />,
    group: "main",
  },
  {
    view: "identity",
    label: "Identity",
    icon: <Link size={16} />,
    group: "main",
  },
  {
    view: "export",
    label: "Export",
    icon: <FileOutput size={16} />,
    group: "main",
  },
  {
    view: "settings",
    label: "Settings",
    icon: <Settings size={16} />,
    group: "bottom",
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
  );
}
