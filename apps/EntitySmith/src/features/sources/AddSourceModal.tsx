import { useEffect, useState } from "react";
import {
  open as openDialog,
} from "@tauri-apps/plugin-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SourceKind } from "@/types";

// ── Source type config ────────────────────────────────────────────────────────

interface KindConfig {
  kind: SourceKind;
  label: string;
  description: string;
  extensions?: string[];  // undefined = folder picker
  isFolder?: boolean;
  isUrl?: boolean;
}

const KIND_CONFIGS: KindConfig[] = [
  {
    kind: "sqlite_file",
    label: "SQLite",
    description: "A .db or .sqlite file",
    extensions: ["db", "sqlite", "sqlite3"],
  },
  {
    kind: "json_file",
    label: "JSON",
    description: "A .json file",
    extensions: ["json"],
  },
  {
    kind: "csv_file",
    label: "CSV",
    description: "A .csv file",
    extensions: ["csv"],
  },
  {
    kind: "markdown_folder",
    label: "Markdown",
    description: "A folder of .md files",
    isFolder: true,
  },
  {
    kind: "pdf_file",
    label: "PDF",
    description: "A .pdf file",
    extensions: ["pdf"],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface AddSourceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string, kind: string, path?: string) => Promise<SourceDescriptor | null>;
  isLoading: boolean;
  error: string | null;
}

import type { SourceDescriptor } from "@/types";

export function AddSourceModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
  error,
}: AddSourceModalProps) {
  const [selectedKind, setSelectedKind] = useState<KindConfig | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [name, setName] = useState("");

  // Reset when the modal opens.
  useEffect(() => {
    if (open) {
      setSelectedKind(null);
      setPath(null);
      setName("");
    }
  }, [open]);

  // Auto-fill name from the picked path.
  useEffect(() => {
    if (!path) return;
    const parts = path.replace(/\\/g, "/").split("/");
    const last = parts[parts.length - 1] ?? "";
    // Strip known extensions.
    const stem = last.replace(/\.(db|sqlite|sqlite3|json|csv|md|markdown|pdf)$/i, "");
    setName(stem || last);
  }, [path]);

  async function handlePickPath() {
    if (!selectedKind) return;
    if (selectedKind.isFolder) {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === "string") setPath(selected);
    } else {
      const filters = selectedKind.extensions
        ? [{ name: selectedKind.label, extensions: selectedKind.extensions }]
        : [];
      const selected = await openDialog({ multiple: false, filters });
      if (typeof selected === "string") setPath(selected);
    }
  }

  async function handleConfirm() {
    if (!name.trim() || !selectedKind) return;
    const result = await onConfirm(name.trim(), selectedKind.kind, path ?? undefined);
    if (result !== null) onOpenChange(false);
  }

  const canConfirm =
    name.trim().length > 0 &&
    selectedKind !== null &&
    !isLoading &&
    // URL sources don't need a path yet; all others do
    (selectedKind.isUrl || path !== null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Source</DialogTitle>
          <DialogDescription>
            Register a data source with this project.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Step 1 — source type */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Source Type
            </Label>
            <div className="grid grid-cols-5 gap-2">
              {KIND_CONFIGS.map((cfg) => (
                <button
                  key={cfg.kind}
                  type="button"
                  onClick={() => {
                    setSelectedKind(cfg);
                    setPath(null);
                    setName("");
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors",
                    selectedKind?.kind === cfg.kind
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent/30"
                  )}
                >
                  <span className="text-lg leading-none">
                    {KIND_ICON[cfg.kind]}
                  </span>
                  <span className="text-[11px] font-medium">{cfg.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 — path picker (once type is chosen) */}
          {selectedKind && (
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {selectedKind.isFolder ? "Folder" : "File"}
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={path ?? ""}
                  placeholder={
                    selectedKind.isFolder
                      ? "No folder selected"
                      : "No file selected"
                  }
                  className="flex-1 cursor-default text-sm"
                  disabled={isLoading}
                />
                <Button
                  variant="outline"
                  type="button"
                  onClick={handlePickPath}
                  disabled={isLoading}
                >
                  Browse…
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 — name (once path is chosen) */}
          {path && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="source-name">Name</Label>
              <Input
                id="source-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Source display name"
                autoFocus
                disabled={isLoading}
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {isLoading ? "Adding…" : "Add Source"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
