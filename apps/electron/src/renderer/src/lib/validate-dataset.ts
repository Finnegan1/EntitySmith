import type { DatasetFile, ValidationError } from '@/types'

export function validateDataset(raw: string): { dataset: DatasetFile | null; errors: ValidationError[] } {
  const errors: ValidationError[] = []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    errors.push({ kind: 'MALFORMED_JSON', message: 'File is not valid JSON.' })
    return { dataset: null, errors }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push({ kind: 'MALFORMED_JSON', message: 'JSON root must be an object.' })
    return { dataset: null, errors }
  }

  const obj = parsed as Record<string, unknown>
  const requiredFields: (keyof DatasetFile)[] = ['datasetName', 'description', 'source', 'data']
  const missingFields = requiredFields.filter((f) => !(f in obj))

  if (missingFields.length > 0) {
    errors.push({
      kind: 'MISSING_FIELDS',
      message: `Missing required fields: ${missingFields.join(', ')}.`,
    })
    return { dataset: null, errors }
  }

  if (!Array.isArray(obj.data)) {
    errors.push({ kind: 'MISSING_FIELDS', message: '"data" field must be an array.' })
    return { dataset: null, errors }
  }

  const data = obj.data as unknown[]

  if (data.length > 1) {
    const firstKeys = Object.keys(data[0] as Record<string, unknown>).sort().join(',')
    const inconsistent = data.some((entry) => {
      if (typeof entry !== 'object' || entry === null) return true
      return (
        Object.keys(entry as Record<string, unknown>)
          .sort()
          .join(',') !== firstKeys
      )
    })
    if (inconsistent) {
      errors.push({
        kind: 'INCONSISTENT_ATTRIBUTES',
        message: 'Not all entries have the same attribute keys.',
      })
      return { dataset: null, errors }
    }
  }

  const dataset: DatasetFile = {
    datasetName: String(obj.datasetName),
    description: String(obj.description),
    source: String(obj.source),
    data: data as Record<string, unknown>[],
  }

  return { dataset, errors }
}
