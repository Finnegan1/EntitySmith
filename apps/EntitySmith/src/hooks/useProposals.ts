import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Proposal, ProposalStatus, ReviewAction } from "@/types";

interface UseProposalsReturn {
  proposals: Proposal[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  pendingCount: number;
  generateProposals: () => Promise<void>;
  reviewProposal: (
    proposalId: string,
    action: ReviewAction,
    reviewedPredicate?: string,
    reviewedCardinality?: string,
    reversed?: boolean,
    inversePredicate?: string,
  ) => Promise<void>;
  resetProposal: (proposalId: string) => Promise<void>;
  reload: () => Promise<void>;
  clearError: () => void;
}

export function useProposals(
  statusFilter?: ProposalStatus,
): UseProposalsReturn {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await invoke<Proposal[]>("list_proposals", {
        statusFilter: statusFilter ?? null,
      });
      setProposals(result);
    } catch (e) {
      // No project open yet — ignore silently
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  // Initial load and listen for proposals:updated events
  useEffect(() => {
    load();

    let unlisten: UnlistenFn | undefined;
    listen("proposals:updated", () => {
      load();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [load]);

  const generateProposals = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await invoke<string>("generate_proposals_cmd");
      // proposals:updated event will trigger reload when the job finishes
    } catch (e) {
      setError(String(e));
      setIsGenerating(false);
      return;
    }
    // Clear the generating spinner after a short wait
    // (actual reload comes via the proposals:updated event)
    setTimeout(() => setIsGenerating(false), 500);
  }, []);

  const reviewProposal = useCallback(
    async (
      proposalId: string,
      action: ReviewAction,
      reviewedPredicate?: string,
      reviewedCardinality?: string,
      reversed?: boolean,
      inversePredicate?: string,
    ) => {
      try {
        if (action === "reject") {
          // Rejection only changes proposal status — no schema graph objects created.
          const updated = await invoke<Proposal>("review_proposal", {
            proposalId,
            action,
            reviewedPredicate: null,
            reviewedCardinality: null,
          });
          setProposals((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p)),
          );
        } else if (action === "modify") {
          // Save custom predicate/cardinality first, then promote into the graph.
          await invoke<Proposal>("review_proposal", {
            proposalId,
            action,
            reviewedPredicate: reviewedPredicate ?? null,
            reviewedCardinality: reviewedCardinality ?? null,
          });
          await invoke<void>("promote_proposal", {
            proposalId,
            reversed: reversed ?? false,
            inversePredicate: inversePredicate ?? null,
          });
        } else {
          // "accept" → promote directly.
          await invoke<void>("promote_proposal", {
            proposalId,
            reversed: reversed ?? false,
            inversePredicate: inversePredicate ?? null,
          });
        }
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  const resetProposal = useCallback(async (proposalId: string) => {
    try {
      await invoke("reset_proposal", { proposalId });
      // proposals:updated event will trigger reload
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const pendingCount = proposals.filter((p) => p.status === "pending").length;

  return {
    proposals,
    isLoading,
    isGenerating,
    error,
    pendingCount,
    generateProposals,
    reviewProposal,
    resetProposal,
    reload: load,
    clearError,
  };
}
