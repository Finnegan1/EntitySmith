import type { ColumnMapping, XsdDatatype, DataEntry } from '@/types'

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (c: string) => c.toLowerCase())
}

/** Dataset name → RDF class CURIE (PascalCase, singular), e.g. "users.json" → "ex:User" */
export function inferRdfClass(datasetName: string): string {
  const base = datasetName.replace(/\.[^.]+$/, '')
  const words = base.split(/[-_\s]+/)
  const pascal = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('')
  const singular =
    pascal.length > 2 && pascal.endsWith('s') && !pascal.endsWith('ss')
      ? pascal.slice(0, -1)
      : pascal
  return `ex:${singular}`
}

/** Detect best XSD datatype for a column from sampled values */
export function inferDatatype(values: unknown[]): XsdDatatype {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '')
  if (nonNull.length === 0) return 'xsd:string'

  if (nonNull.every((v) => v === true || v === false || v === 'true' || v === 'false'))
    return 'xsd:boolean'

  if (
    nonNull.every((v) => {
      const n = Number(v)
      return !isNaN(n) && Number.isInteger(n) && String(v).trim() !== ''
    })
  )
    return 'xsd:integer'

  if (nonNull.every((v) => !isNaN(Number(v)) && String(v).trim() !== ''))
    return 'xsd:decimal'

  if (nonNull.every((v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v))))
    return 'xsd:dateTime'

  if (nonNull.every((v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v))))
    return 'xsd:date'

  if (nonNull.every((v) => /^https?:\/\//.test(String(v))))
    return 'xsd:anyURI'

  return 'xsd:string'
}

/** Build column → mapping record from column names + dataset rows */
export function inferColumnMappings(
  attributes: string[],
  data: DataEntry[]
): Record<string, ColumnMapping> {
  const sample = data.slice(0, 50)
  const result: Record<string, ColumnMapping> = {}
  for (const attr of attributes) {
    const values = sample.map((row) => row[attr])
    result[attr] = {
      predicate: `ex:${toCamelCase(attr)}`,
      datatype: inferDatatype(values),
      omit: false,
    }
  }
  return result
}

/** Sanitize a value for use in a URI local name */
export function sanitizeLocalName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^_+/, '') || 'blank'
}

/** Build subject IRI from class CURIE + primary key value */
export function makeSubjectIri(rdfClass: string, subjectValue: string): string {
  const local = rdfClass.includes(':') ? rdfClass.split(':').slice(1).join(':') : rdfClass
  return `ex:${local}_${sanitizeLocalName(subjectValue)}`
}

/** Escape a string value for Turtle literal */
export function escapeTurtleLiteral(val: string): string {
  return val
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}
