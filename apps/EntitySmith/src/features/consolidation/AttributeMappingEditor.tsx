import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Sparkles, Table2 } from "lucide-react";
import { useAttributeMappings } from "@/hooks/useAttributeMappings";
import type { AttributeMapping, SchemaGraph } from "@/types";

const XSD_TYPES = [
  "xsd:string",
  "xsd:integer",
  "xsd:float",
  "xsd:boolean",
  "xsd:date",
  "xsd:dateTime",
  "xsd:anyURI",
] as const;

interface AttributeMappingEditorProps {
  schemaGraph: SchemaGraph | null;
}

export function AttributeMappingEditor({ schemaGraph }: AttributeMappingEditorProps) {
  const [selectedEntityTypeId, setSelectedEntityTypeId] = useState<string | null>(null);
  const { mappings, isLoading, upsertMapping, autoGenerate } =
    useAttributeMappings(selectedEntityTypeId);

  const entityTypes = schemaGraph?.entityTypes ?? [];

  if (entityTypes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Table2 size={40} strokeWidth={1} />
        <p className="text-sm">No entity types in schema graph.</p>
        <p className="text-xs">
          Merge or create entity types first, then map their attributes here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Entity type selector */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">Entity Type:</span>
        <div className="flex flex-wrap gap-1.5">
          {entityTypes.map((et) => (
            <button
              key={et.entityType.id}
              onClick={() => setSelectedEntityTypeId(et.entityType.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedEntityTypeId === et.entityType.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {et.entityType.name}
              {et.bindings.length > 0 && (
                <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 h-3.5">
                  {et.bindings.length}
                </Badge>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {selectedEntityTypeId && (
          <Button
            size="sm"
            variant="outline"
            onClick={autoGenerate}
            disabled={isLoading}
            className="text-xs"
          >
            <Sparkles size={12} className="mr-1.5" />
            Auto-generate
          </Button>
        )}
      </div>

      {/* Mapping table */}
      {!selectedEntityTypeId ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Select an entity type to edit attribute mappings.
        </div>
      ) : isLoading ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading mappings…
        </div>
      ) : mappings.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <p className="text-sm">No attribute mappings.</p>
          <p className="text-xs">
            Click <strong>Auto-generate</strong> to create mappings from source columns.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_1fr_1fr_100px_40px] gap-0 bg-muted/30 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground border-b border-border">
            <span>Source Column</span>
            <span>Canonical Name</span>
            <span>RDF Predicate</span>
            <span className="text-center">Datatype</span>
            <span className="text-center">Omit</span>
          </div>
          <ScrollArea className="flex-1">
            {mappings.map((m) => (
              <MappingRowEditor
                key={m.id}
                mapping={m}
                onSave={upsertMapping}
              />
            ))}
          </ScrollArea>
        </>
      )}
    </div>
  );
}

function MappingRowEditor({
  mapping,
  onSave,
}: {
  mapping: AttributeMapping;
  onSave: (params: {
    entityTypeId: string;
    sourceId: string;
    sourceColumn: string;
    canonicalName: string;
    rdfPredicate?: string;
    xsdDatatype?: string;
    isOmitted: boolean;
    sortOrder: number;
  }) => Promise<AttributeMapping>;
}) {
  const [canonicalName, setCanonicalName] = useState(mapping.canonicalName);
  const [rdfPredicate, setRdfPredicate] = useState(mapping.rdfPredicate ?? "");
  const [xsdDatatype, setXsdDatatype] = useState(mapping.xsdDatatype ?? "xsd:string");
  const [isOmitted, setIsOmitted] = useState(mapping.isOmitted);

  const handleBlur = useCallback(() => {
    if (
      canonicalName !== mapping.canonicalName ||
      rdfPredicate !== (mapping.rdfPredicate ?? "") ||
      xsdDatatype !== (mapping.xsdDatatype ?? "xsd:string") ||
      isOmitted !== mapping.isOmitted
    ) {
      onSave({
        entityTypeId: mapping.entityTypeId,
        sourceId: mapping.sourceId,
        sourceColumn: mapping.sourceColumn,
        canonicalName,
        rdfPredicate: rdfPredicate || undefined,
        xsdDatatype: xsdDatatype || undefined,
        isOmitted,
        sortOrder: mapping.sortOrder,
      });
    }
  }, [canonicalName, rdfPredicate, xsdDatatype, isOmitted, mapping, onSave]);

  return (
    <div
      className={`grid grid-cols-[1fr_1fr_1fr_100px_40px] items-center gap-0 border-b border-border/40 px-4 py-1 text-sm last:border-b-0 ${
        isOmitted ? "opacity-40" : ""
      }`}
    >
      {/* Source column */}
      <span className="font-mono text-xs">{mapping.sourceColumn}</span>

      {/* Canonical name */}
      <Input
        value={canonicalName}
        onChange={(e) => setCanonicalName(e.target.value)}
        onBlur={handleBlur}
        className="h-6 text-xs font-mono px-1.5"
      />

      {/* RDF predicate */}
      <Input
        value={rdfPredicate}
        onChange={(e) => setRdfPredicate(e.target.value)}
        onBlur={handleBlur}
        placeholder="ex:predicate"
        className="h-6 text-xs font-mono px-1.5"
      />

      {/* XSD datatype */}
      <select
        value={xsdDatatype}
        onChange={(e) => {
          setXsdDatatype(e.target.value);
          // Auto-save on select change
          onSave({
            entityTypeId: mapping.entityTypeId,
            sourceId: mapping.sourceId,
            sourceColumn: mapping.sourceColumn,
            canonicalName,
            rdfPredicate: rdfPredicate || undefined,
            xsdDatatype: e.target.value || undefined,
            isOmitted,
            sortOrder: mapping.sortOrder,
          });
        }}
        className="h-6 rounded border border-border bg-background px-1 text-[10px]"
      >
        {XSD_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {/* Omit toggle */}
      <div className="flex justify-center">
        <button
          className={`h-5 w-5 rounded border flex items-center justify-center ${
            isOmitted
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-muted-foreground/30"
          }`}
          onClick={() => {
            const next = !isOmitted;
            setIsOmitted(next);
            onSave({
              entityTypeId: mapping.entityTypeId,
              sourceId: mapping.sourceId,
              sourceColumn: mapping.sourceColumn,
              canonicalName,
              rdfPredicate: rdfPredicate || undefined,
              xsdDatatype: xsdDatatype || undefined,
              isOmitted: next,
              sortOrder: mapping.sortOrder,
            });
          }}
        >
          {isOmitted && <Check size={12} />}
        </button>
      </div>
    </div>
  );
}
