import { useState } from "react";
import { Info, Plus, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { EntityType, EntityTypeWithBindings, SchemaGraph, SourceEntitySummary } from "@/types";

interface EntityCatalogViewProps {
  sourceEntities: SourceEntitySummary[];
  schemaGraph: SchemaGraph | null;
  selectedEntityTypeId: string | null;
  onEntityTypeSelect: (et: EntityTypeWithBindings | null) => void;
  onCreateEntityType: (name: string) => Promise<EntityType>;
  onBindSourceEntity: (
    entityTypeId: string,
    sourceId: string,
    entityName: string,
  ) => Promise<unknown>;
  onUnbindSourceEntity: (
    entityTypeId: string,
    sourceId: string,
    entityName: string,
  ) => Promise<void>;
}

// ── Tooltip helper ────────────────────────────────────────────────────────────

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

// Column header with an inline info icon that triggers the tooltip.
function ColHeader({ label, tip }: { label: string; tip: string }) {
  return (
    <Tip content={tip} side="bottom">
      <span className="inline-flex cursor-help items-center gap-1">
        {label}
        <Info size={9} className="opacity-40" />
      </span>
    </Tip>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EntityCatalogView({
  sourceEntities,
  schemaGraph,
  selectedEntityTypeId,
  onEntityTypeSelect,
  onCreateEntityType,
  onBindSourceEntity,
  onUnbindSourceEntity,
}: EntityCatalogViewProps) {
  const [creating, setCreating] = useState<string | null>(null); // key = `${sourceId}:${entityName}`

  function handleRowClick(entity: SourceEntitySummary) {
    if (!entity.boundEntityTypeId || !schemaGraph) {
      onEntityTypeSelect(null);
      return;
    }
    const isAlreadySelected = entity.boundEntityTypeId === selectedEntityTypeId;
    if (isAlreadySelected) {
      onEntityTypeSelect(null);
      return;
    }
    const found = schemaGraph.entityTypes.find(
      (et) => et.entityType.id === entity.boundEntityTypeId,
    ) ?? null;
    onEntityTypeSelect(found);
  }

  async function handleCreateAndBind(entity: SourceEntitySummary) {
    const key = `${entity.sourceId}:${entity.entityName}`;
    setCreating(key);
    try {
      const existing = schemaGraph?.entityTypes.find(
        (et) => et.entityType.name === entity.entityName,
      )?.entityType;
      const et = existing ?? (await onCreateEntityType(entity.entityName));
      await onBindSourceEntity(et.id, entity.sourceId, entity.entityName);
    } finally {
      setCreating(null);
    }
  }

  if (sourceEntities.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-xs text-muted-foreground">
          Profile sources first to populate the catalog.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
        <ColHeader
          label="Entity"
          tip="A table, collection, or file discovered in one of your registered sources. The source name is shown below the entity name."
        />
        <ColHeader
          label="Rows"
          tip="Approximate number of records in this entity, measured automatically during source profiling."
        />
        <ColHeader
          label="Links"
          tip="Total number of connection proposals that reference this entity (from either side of a relationship). Proposals are detected from foreign keys, column-name patterns, and shared sample values."
        />
        <span className="text-right w-16">
          <ColHeader
            label="Similarity"
            tip="Confidence of the strongest proposal that references this entity. Higher means the analysis engine found stronger evidence for a relationship — e.g. a declared foreign key scores 95%, a name-pattern match scores ~70%."
          />
        </span>
        <ColHeader
          label="Canonical Type"
          tip="The schema-graph node this source entity is mapped to. Once bound, this entity's records will be exported under that type's RDF class. Unbound entities are excluded from the graph and all exports."
        />
      </div>

      {/* Rows */}
      {sourceEntities.map((entity) => {
        const key = `${entity.sourceId}:${entity.entityName}`;
        const isCreating = creating === key;
        const pct = Math.round(entity.maxSimilarity * 100);
        const isSelected =
          !!entity.boundEntityTypeId && entity.boundEntityTypeId === selectedEntityTypeId;

        return (
          <div
            key={key}
            role="button"
            tabIndex={0}
            onClick={() => handleRowClick(entity)}
            onKeyDown={(e) => e.key === "Enter" && handleRowClick(entity)}
            className={`grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-3 px-3 py-2 text-xs border-b border-border/50 transition-colors cursor-pointer ${
              isSelected
                ? "bg-accent/60"
                : entity.boundEntityTypeId
                  ? "hover:bg-muted/30"
                  : "opacity-70 hover:bg-muted/20"
            }`}
          >
            {/* Entity name + source */}
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{entity.entityName}</p>
              <p className="text-[10px] text-muted-foreground truncate">{entity.sourceName}</p>
            </div>

            {/* Row count */}
            <span className="text-right tabular-nums text-muted-foreground">
              {entity.rowCount.toLocaleString()}
            </span>

            {/* Proposal count */}
            <Tip
              content={
                entity.proposalCount === 0
                  ? "No proposals reference this entity yet. Run analysis on the Proposals page to detect relationships."
                  : `${entity.proposalCount} connection ${entity.proposalCount === 1 ? "proposal references" : "proposals reference"} this entity. Review them on the Proposals page.`
              }
            >
              <span className="text-right tabular-nums text-muted-foreground">
                {entity.proposalCount}
              </span>
            </Tip>

            {/* Similarity bar */}
            <Tip
              content={
                pct === 0
                  ? "No proposals found for this entity — similarity is 0%. Run analysis to detect relationships."
                  : `Strongest proposal confidence: ${pct}%. ${pct >= 85 ? "High confidence — likely a real relationship." : pct >= 60 ? "Medium confidence — worth reviewing." : "Low confidence — may be a weak or incidental match."}`
              }
            >
              <div className="w-16 flex items-center gap-1">
                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground w-6 text-right">{pct}%</span>
              </div>
            </Tip>

            {/* Canonical type action */}
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {entity.boundEntityTypeId ? (
                <>
                  <Tip
                    content={`Bound to the "${entity.boundEntityTypeName}" canonical type. Click the row to inspect it in the details panel and see its source bindings and relationships.`}
                    side="left"
                  >
                    <Badge variant="secondary" className="text-[10px] h-5 cursor-default">
                      {entity.boundEntityTypeName}
                    </Badge>
                  </Tip>
                  <Tip
                    content="Remove this source entity's binding to its canonical type. The type itself stays in the graph — only this source mapping is removed."
                    side="left"
                  >
                    <button
                      onClick={() =>
                        onUnbindSourceEntity(
                          entity.boundEntityTypeId!,
                          entity.sourceId,
                          entity.entityName,
                        )
                      }
                      className="p-0.5 rounded text-muted-foreground/50 hover:text-destructive transition-colors"
                    >
                      <Unlink size={11} />
                    </button>
                  </Tip>
                </>
              ) : (
                <Tip
                  content={`Create a canonical type named "${entity.entityName}" and bind this source entity to it. The new type will appear as a node in the schema graph and can be connected to other types via relationships.`}
                  side="left"
                >
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-5 text-[10px] px-1.5 gap-1"
                    onClick={() => handleCreateAndBind(entity)}
                    disabled={isCreating}
                  >
                    <Plus size={9} />
                    {isCreating ? "…" : "Create Type"}
                  </Button>
                </Tip>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
