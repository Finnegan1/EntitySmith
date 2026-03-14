Now I have a clear picture of both the reference and your current implementation. Here's the gap analysis:

  ---
  Current State vs. Full RDF Graph

  What your tool does today:
  - Nodes = entire datasets (CSV/JSON files with columns listed)
  - Edges = column-to-column joins between datasets
  - Triples are generated at runtime by doing inner joins on actual data rows
  - It's essentially a data mapping / ETL schema editor, not an RDF graph editor

  What a proper RDF graph requires:

  Missing Node Types

  ┌──────────────┬──────────────────────────────────────────────────────────────────────────────────────────┬─────────────────────────┐
  │  Node Type   │                                       Description                                        │         Visual          │
  ├──────────────┼──────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────┤
  │ URI/IRI Node │ A named resource like ex:Person or http://...                                            │ Oval/ellipse            │
  ├──────────────┼──────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────┤
  │ Literal Node │ A plain value with datatype: "John"^^xsd:string, 42^^xsd:integer, "2024-01-01"^^xsd:date │ Rectangle, green border │
  ├──────────────┼──────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────┤
  │ Blank Node   │ Anonymous resource _:b0                                                                  │ Diamond or dashed oval  │
  ├──────────────┼──────────────────────────────────────────────────────────────────────────────────────────┼─────────────────────────┤
  │ Class Node   │ rdf:type rdfs:Class — represents a class/category                                        │ Gold border             │
  └──────────────┴──────────────────────────────────────────────────────────────────────────────────────────┴─────────────────────────┘

  Currently you only have dataset nodes (table schema cards).

  Missing Edge/Predicate Features

  - Object properties (URI→URI, blue edges)
  - Data properties (URI→Literal, green edges)
  - Built-in predicates: rdf:type, rdfs:label, rdfs:subClassOf, owl:sameAs
  - Predicate as a full URI or CURIE (ex:hasName, foaf:knows)

  Missing Editing Tools

  1. "Create URI Node" — free-hand add a resource node with a URI
  2. "Create Literal Node" — add a value node, pick datatype from dropdown (xsd:string, xsd:integer, xsd:dateTime, etc.) + optional language tag (@en)
  3. "Create Blank Node" — anonymous resource
  4. Inline node URI editing — double-click to edit a node's URI/value
  5. Prefix/Namespace manager — define ex:, foaf:, schema:, rdf: etc. with their full IRIs; all node/edge labels use CURIEs
  6. Node type selector — when creating a node, choose URI / Literal / Blank
  7. Quick rdf:type assignment — right-click a node → "Set type…" picks a class
  8. Node detail panel — sidebar showing all triples for a selected node
  9. Import RDF — paste/upload Turtle, JSON-LD, N-Triples and have the graph render

  Visual Differentiation Missing

  - Different shapes per node type (ellipse for URI, rect for Literal, diamond for Blank)
  - Color-coded borders: gold for Classes, magenta for Instances, green for Literals
  - Edge color distinction: blue for object properties, green for data properties

  ---
  Summary: Your current graph is a relational-to-RDF mapping tool. To be a proper RDF graph builder you need to shift from "dataset nodes with column handles" to individual RDF resource nodes that users create manually, plus a namespace manager,
  literal/blank node support, and typed predicates. That's the core missing layer.

  Want me to plan and implement this? The highest-impact first steps would be:
  1. New node types (URI, Literal, Blank) with distinct visuals
  2. A prefix manager panel
  3. A "create node" toolbar/context menu on the canvas
  4. Typed predicate edges (object vs data property)

✻ Crunched for 1m 11s

❯ please plan and implement this.
The goal of this application is to help the user with creating a knoledge graph as easy as possible from such given datasets. (with as good as possible clearity and as less as possible user steps)
