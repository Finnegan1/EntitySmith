import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
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

interface NewProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user confirms. The caller handles the IPC. */
  onConfirm: (name: string, directory: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function NewProjectModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
  error,
}: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [directory, setDirectory] = useState<string | null>(null);

  // Reset form state when the modal opens.
  useEffect(() => {
    if (open) {
      setName("");
      setDirectory(null);
    }
  }, [open]);

  async function handlePickDirectory() {
    // open() with directory:true picks a folder.
    // Returns string | null when multiple:false.
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setDirectory(selected);
    }
  }

  async function handleConfirm() {
    if (!name.trim() || !directory) return;
    await onConfirm(name.trim(), directory);
    // AppShell closes the modal via useEffect watching project state.
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canConfirm) handleConfirm();
  }

  const canConfirm = name.trim().length > 0 && directory !== null && !isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Choose a name and save location for your project file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Project name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Knowledge Graph"
              autoFocus
              disabled={isLoading}
            />
          </div>

          {/* Save location */}
          <div className="flex flex-col gap-1.5">
            <Label>Save Location</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={directory ?? ""}
                placeholder="No folder selected"
                className="flex-1 cursor-default"
                disabled={isLoading}
              />
              <Button
                variant="outline"
                type="button"
                onClick={handlePickDirectory}
                disabled={isLoading}
              >
                Browse…
              </Button>
            </div>
            {directory && name.trim() && (
              <p className="text-[11px] text-muted-foreground">
                Will create: {directory}/{name.trim()}.entitysmith
              </p>
            )}
          </div>

          {/* IPC error feedback */}
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
            {isLoading ? "Creating…" : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
