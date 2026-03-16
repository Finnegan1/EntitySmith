import { useState } from "react";
import { Database, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AddSourceModal } from "./AddSourceModal";
import { useSources } from "@/hooks/useSources";
import { cn } from "@/lib/utils";
import type { SourceDescriptor, SourceKind } from "@/types";

interface SourcesViewProps {
  projectId: string;
  onSourceSelect: (source: SourceDescriptor | null) => void;
  selectedSourceId: string | null;
}

export function SourcesView({
  projectId,
  onSourceSelect,
  selectedSourceId,
}: SourcesViewProps) {
  const [addOpen, setAddOpen] = useState(false);
  const { sources, isLoading, error, clearError, addSource, removeSource } =
    useSources(projectId);

  const grouped = groupByKindCategory(sources);

  async function handleAdd(name: string, kind: string, path?: string) {
    const result = await addSource(name, kind, path);
    if (result) onSourceSelect(result);
    return result;
  }

  async function handleRemove(e: React.MouseEvent, source: SourceDescriptor) {
    e.stopPropagation();
    if (selectedSourceId === source.id) onSourceSelect(null);
    await removeSource(source.id);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="text-xs text-muted-foreground">
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </span>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => { clearError(); setAddOpen(true); }}
          disabled={isLoading}
        >
          <Plus size={13} />
          Add Source
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-4 py-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Source list */}
      {sources.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-3">
            {grouped.map(({ label, items }, gi) => (
              <div key={label}>
                {gi > 0 && <Separator className="my-3" />}
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {items.map((source) => (
                    <SourceRow
                      key={source.id}
                      source={source}
                      isSelected={source.id === selectedSourceId}
                      onClick={() => onSourceSelect(source)}
                      onRemove={(e) => handleRemove(e, source)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      <AddSourceModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onConfirm={handleAdd}
        isLoading={isLoading}
        error={error}
      />
    </div>
  );
}

// ── Source row ────────────────────────────────────────────────────────────────

function SourceRow({
  source,
  isSelected,
  onClick,
  onRemove,
}: {
  source: SourceDescriptor;
  isSelected: boolean;
  onClick: () => void;
  onRemove: (e: React.MouseEvent) => void;
}) {
  const fileName = source.path
    ? source.path.replace(/\\/g, "/").split("/").pop() ?? source.path
    : undefined;

  return (
    // Use div+role instead of button to avoid invalid nested-button HTML
    // (the remove icon is also a button, and buttons can't nest in HTML).
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" || e.key === " " ? onClick() : undefined}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/50 hover:text-accent-foreground"
      )}
    >
      <span className="shrink-0 text-sm">{KIND_ICON[source.kind]}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {source.name}
        </p>
        {fileName && (
          <p className="truncate text-[11px] text-muted-foreground">{fileName}</p>
        )}
      </div>
      <Badge variant="outline" className="shrink-0 text-[10px]">
        {KIND_LABEL[source.kind]}
      </Badge>
      <button
        onClick={onRemove}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        title="Remove source"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Database size={22} />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No sources yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add a SQLite, JSON, or CSV file to begin profiling.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onAdd} className="gap-1.5">
        <Plus size={13} />
        Add Source
      </Button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const KIND_ICON: Record<SourceKind, string> = {
  sqlite_file: "🗄️",
  json_file: "{ }",
  csv_file: "📊",
  markdown_folder: "📝",
  pdf_file: "📄",
  url: "🔗",
  postgres: "🐘",
  mysql: "🐬",
};

const KIND_LABEL: Record<SourceKind, string> = {
  sqlite_file: "SQLite",
  json_file: "JSON",
  csv_file: "CSV",
  markdown_folder: "Markdown",
  pdf_file: "PDF",
  url: "URL",
  postgres: "Postgres",
  mysql: "MySQL",
};

const KIND_CATEGORY: Record<SourceKind, string> = {
  sqlite_file: "Structured",
  json_file: "Structured",
  csv_file: "Structured",
  postgres: "Structured",
  mysql: "Structured",
  markdown_folder: "Unstructured",
  pdf_file: "Unstructured",
  url: "Unstructured",
};

function groupByKindCategory(
  sources: SourceDescriptor[]
): { label: string; items: SourceDescriptor[] }[] {
  const map = new Map<string, SourceDescriptor[]>();
  for (const s of sources) {
    const cat = KIND_CATEGORY[s.kind] ?? "Other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(s);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}
