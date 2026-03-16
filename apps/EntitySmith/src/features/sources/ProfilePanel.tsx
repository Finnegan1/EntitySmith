import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FullSourceProfile, SourceAttributeProfile } from "@/types";

// ── Tooltip helper ─────────────────────────────────────────────────────────────

function Tip({
  children,
  content,
  side = "top",
}: {
  children: React.ReactNode;
  content: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <p className="max-w-[260px]">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ProfilePanelProps {
  profile: FullSourceProfile;
}

export function ProfilePanel({ profile }: ProfilePanelProps) {
  const declaredFkCount = profile.fkCandidates.filter((f) => f.isDeclared).length;
  const inferredFkCount = profile.fkCandidates.filter((f) => !f.isDeclared).length;

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

      {/* FK candidates badges */}
      {profile.fkCandidates.length > 0 && (
        <div className="flex items-center gap-1.5">
          {declaredFkCount > 0 && (
            <Tip
              content="Foreign keys explicitly declared in the source schema (e.g. REFERENCES constraints in SQLite). Near-certain relationships — the source itself asserts them."
              side="right"
            >
              <Badge variant="secondary" className="text-[10px] cursor-help">
                {declaredFkCount} declared FK
              </Badge>
            </Tip>
          )}
          {inferredFkCount > 0 && (
            <Tip
              content="Foreign key candidates detected by column naming patterns — e.g. a column named 'user_id' alongside a table called 'users'. Not declared in the schema but structurally likely."
              side="right"
            >
              <Badge variant="outline" className="text-[10px] cursor-help">
                {inferredFkCount} inferred FK
              </Badge>
            </Tip>
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
          <Tip
            content="Relationships between entities in this source detected during profiling. Declared FKs come from schema constraints; inferred FKs are detected from column naming patterns."
            side="right"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-help">
              Foreign Keys
            </p>
          </Tip>
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
                <Tip
                  content={
                    fk.isDeclared
                      ? "Explicitly declared in the source schema. High-confidence relationship."
                      : "Inferred from column naming pattern. Not declared in the source but structurally matched."
                  }
                  side="right"
                >
                  <Badge
                    variant={fk.isDeclared ? "secondary" : "outline"}
                    className="mt-1 text-[9px] cursor-help"
                  >
                    {fk.isDeclared ? "declared" : "inferred"}
                  </Badge>
                </Tip>
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
        <Tip content="Total number of records in this entity, counted during profiling." side="left">
          <span className="text-[10px] text-muted-foreground cursor-help">
            {ewa.profile.rowCount.toLocaleString()} rows
          </span>
        </Tip>
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
          <Tip
            content="Primary key — this column uniquely identifies each row. It will be used as the default subject column for URI minting during export (the identifier in the generated RDF triples)."
            side="right"
          >
            <span className="text-[9px] font-bold text-amber-600 uppercase cursor-help">
              PK
            </span>
          </Tip>
        )}
        <span className="flex-1 truncate text-[11px] font-medium text-foreground font-mono">
          {attr.name}
        </span>
        <Tip
          content={`Inferred data type for this column, determined from the sampled values. Used to assign XSD datatypes in the exported RDF (e.g. xsd:integer, xsd:date).`}
          side="left"
        >
          <Badge variant="outline" className="shrink-0 text-[9px] font-mono cursor-help">
            {attr.inferredType}
          </Badge>
        </Tip>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {attr.isNullable && attr.nullPct > 0 && (
          <Tip
            content={`${Math.round(attr.nullPct * 100)}% of rows have no value for this column. High null rates on a primary key will cause those rows to be skipped during export.`}
            side="right"
          >
            <span className="cursor-help">{Math.round(attr.nullPct * 100)}% null</span>
          </Tip>
        )}
        <Tip
          content={`${Math.round(attr.uniquePct * 100)}% of values in this column are distinct. Near 100% suggests a good primary key or natural identifier. Low uniqueness suggests a categorical or foreign key column.`}
          side="right"
        >
          <span
            className={`cursor-help ${attr.uniquePct > 0.95 ? "text-blue-600" : ""}`}
          >
            {Math.round(attr.uniquePct * 100)}% unique
          </span>
        </Tip>
        {attr.minValue != null && attr.maxValue != null && (
          <Tip
            content="Minimum and maximum values observed across sampled rows. Useful for spotting data ranges, outliers, or unexpected values."
            side="right"
          >
            <span className="truncate font-mono cursor-help">
              [{attr.minValue} – {attr.maxValue}]
            </span>
          </Tip>
        )}
      </div>

      {/* Top values */}
      {attr.topValues.length > 0 && (
        <Tip
          content="Most frequent values found during profiling, with occurrence counts. Helps identify categorical fields, FK references, or data quality issues like inconsistent formatting."
          side="right"
        >
          <div className="mt-0.5 flex flex-wrap gap-1 cursor-help">
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
        </Tip>
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
