import { useState } from 'react'
import { Link2, X, ArrowRight, ChevronRight, Trash2, RotateCcw, Inbox } from 'lucide-react'
import { useConnectionProposals } from '@/hooks/use-connection-proposals'
import { useRdfGraph } from '@/hooks/use-rdf-graph'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { ConnectionProposal } from '@/types'

type PanelTab = 'active' | 'binned'

export function ConnectionProposalsPanel() {
  const { proposals, dismissProposal, restoreProposal } = useConnectionProposals()
  const { setPendingConnection } = useRdfGraph()
  const [tab, setTab] = useState<PanelTab>('active')

  const activeProposals = proposals.filter((p) => !p.dismissed)
  const binnedProposals = proposals.filter((p) => p.dismissed)

  function handleAdd(proposal: ConnectionProposal) {
    // Do NOT dismiss here — only dismiss after the user confirms the predicate
    // name in the dialog. If they cancel, the proposal stays in "New".
    setPendingConnection({
      source: proposal.sourceNodeId,
      sourceHandle: `${proposal.fromColumn}-right`,
      target: proposal.targetNodeId,
      targetHandle: `${proposal.toColumn}-left`,
      proposalId: proposal.id,
    })
  }

  const shown = tab === 'active' ? activeProposals : binnedProposals

  return (
    <div className="flex w-[240px] shrink-0 flex-col border-l bg-muted/10">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Suggestions
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 border-b">
        <button
          onClick={() => setTab('active')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-colors border-b-2',
            tab === 'active'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          New
          {activeProposals.length > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
              {activeProposals.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('binned')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-colors border-b-2',
            tab === 'binned'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Trash2 className="h-3 w-3" />
          Bin
          {binnedProposals.length > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
              {binnedProposals.length}
            </span>
          )}
        </button>
      </div>

      <ScrollArea className="flex-1">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Inbox className="h-6 w-6 text-muted-foreground/30" />
            <p className="text-[11px] text-muted-foreground/50">
              {tab === 'active'
                ? 'No suggestions yet.\nDrop DB tables onto the canvas to detect FK relationships.'
                : 'No binned suggestions.'}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 p-2">
            {shown.map((proposal) => (
              <div
                key={proposal.id}
                className="rounded-lg border bg-card p-2.5 text-xs shadow-sm"
              >
                {/* Table names */}
                <div className="mb-1.5 flex items-center gap-1 font-medium text-foreground">
                  <span className="max-w-[72px] truncate" title={proposal.sourceTable}>
                    {proposal.sourceTable}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="max-w-[72px] truncate" title={proposal.targetTable}>
                    {proposal.targetTable}
                  </span>
                </div>

                {/* FK column info */}
                <div className="mb-2 flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                  <span className="truncate">{proposal.fromColumn}</span>
                  <ChevronRight className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{proposal.toColumn}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-1.5">
                  {tab === 'active' ? (
                    <>
                      <button
                        className="flex h-6 flex-1 items-center justify-center rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                        onClick={() => handleAdd(proposal)}
                      >
                        Add connection
                      </button>
                      <button
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded border transition-colors hover:bg-muted hover:text-foreground"
                        onClick={() => dismissProposal(proposal.id)}
                        title="Move to bin"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <button
                      className="flex h-6 flex-1 items-center justify-center gap-1.5 rounded border px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => restoreProposal(proposal.id)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'active' && shown.length > 0 && (
          <p className="px-3 pb-3 text-[10px] text-muted-foreground/40">
            Inferred from foreign key relationships.
          </p>
        )}
      </ScrollArea>
    </div>
  )
}
