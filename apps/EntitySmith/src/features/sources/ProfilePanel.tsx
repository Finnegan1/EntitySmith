import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { FullSourceProfile, SourceAttributeProfile } from "@/types";

interface ProfilePanelProps {
  profile: FullSourceProfile;
}

export function ProfilePanel({ profile }: ProfilePanelProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Summary row */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {profile.entities.length}{" "}
          {profile.entities.length === 1 ? "entity" : "entities"}
        </span>
        <span className="text-muted-foreground">
          Profiled {formatRelative(profile.summary.profiledAt)}
        </span>
      </div>

      {/* FK candidates badge */}
      {profile.fkCandidates.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {profile.fkCandidates.filter((f) => f.isDeclared).length} declared
            FK
          </Badge>
          {profile.fkCandidates.filter((f) => !f.isDeclared).length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {profile.fkCandidates.filter((f) => !f.isDeclared).length}{" "}
              inferred FK
            </Badge>
          )}
        </div>
      )}

      {/* Entity list */}
      <div className="flex flex-col gap-3">
        {profile.entities.map((ewa) => (
          <EntitySection key={ewa.profile.name} ewa={ewa} />
        ))}
      </div>

      {/* FK candidates table */}
      {profile.fkCandidates.length > 0 && (
        <>
          <Separator />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Foreign Keys
          </p>
          <div className="flex flex-col gap-1.5">
            {profile.fkCandidates.map((fk, i) => (
              <div key={i} className="rounded-md border border-border p-2 text-[11px]">
                <div className="flex items-center gap-1 font-mono text-foreground">
                  <span className="text-muted-foreground">{fk.fromEntity}</span>
                  <span className="text-muted-foreground">.</span>
                  <span className="font-medium">{fk.fromColumn}</span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span className="text-muted-foreground">{fk.toEntity}</span>
                  <span className="text-muted-foreground">.</span>
                  <span className="font-medium">{fk.toColumn}</span>
                </div>
                <Badge
                  variant={fk.isDeclared ? "secondary" : "outline"}
                  className="mt-1 text-[9px]"
                >
                  {fk.isDeclared ? "declared" : "inferred"}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EntitySection({
  ewa,
}: {
  ewa: FullSourceProfile["entities"][number];
}) {
  return (
    <div className="rounded-md border border-border">
      {/* Entity header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-2.5 py-1.5">
        <p className="text-xs font-semibold text-foreground font-mono">
          {ewa.profile.name}
        </p>
        <span className="text-[10px] text-muted-foreground">
          {ewa.profile.rowCount.toLocaleString()} rows
        </span>
      </div>

      {/* Attribute list */}
      <div className="divide-y divide-border">
        {ewa.attributes.map((attr) => (
          <AttributeRow key={attr.name} attr={attr} />
        ))}
      </div>
    </div>
  );
}

function AttributeRow({ attr }: { attr: SourceAttributeProfile }) {
  return (
    <div className="flex flex-col gap-0.5 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        {attr.isPk && (
          <span className="text-[9px] font-bold text-amber-600 uppercase">
            PK
          </span>
        )}
        <span className="flex-1 truncate text-[11px] font-medium text-foreground font-mono">
          {attr.name}
        </span>
        <Badge variant="outline" className="shrink-0 text-[9px] font-mono">
          {attr.inferredType}
        </Badge>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {attr.isNullable && attr.nullPct > 0 && (
          <span>{Math.round(attr.nullPct * 100)}% null</span>
        )}
        <span className={attr.uniquePct > 0.95 ? "text-blue-600" : ""}>
          {Math.round(attr.uniquePct * 100)}% unique
        </span>
        {attr.minValue != null && attr.maxValue != null && (
          <span className="truncate font-mono">
            [{attr.minValue} – {attr.maxValue}]
          </span>
        )}
      </div>

      {/* Top values */}
      {attr.topValues.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {attr.topValues.map((tv) => (
            <span
              key={tv.value}
              className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[9px]"
            >
              {tv.value}
              <span className="text-muted-foreground">×{tv.count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProfileLoading() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 size={12} className="animate-spin" />
      Profiling…
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000)
      return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000)
      return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}
