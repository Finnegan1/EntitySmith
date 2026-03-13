import { Share2 } from 'lucide-react'

export function RdfView() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Share2 className="h-12 w-12 opacity-15" />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">RDF View</p>
        <p className="mt-1 text-xs">Coming soon</p>
      </div>
    </div>
  )
}
