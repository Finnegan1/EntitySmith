import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { ValidationError } from '@/types'

interface Props {
  errors: ValidationError[]
}

export function DatasetError({ errors }: Props) {
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Validation Failed</AlertTitle>
        <AlertDescription>
          <ul className="mt-2 list-disc pl-4 space-y-1">
            {errors.map((e, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{e.kind}</span>: {e.message}
              </li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  )
}
