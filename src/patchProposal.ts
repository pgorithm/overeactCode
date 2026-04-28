import { randomUUID } from "crypto";

export const PATCH_PROPOSAL_STATUSES = [
  "proposed",
  "applied",
  "rejected",
  "superseded"
] as const;

export type PatchProposalStatus = (typeof PATCH_PROPOSAL_STATUSES)[number];

export interface PatchProposal {
  id: string;
  sessionId: string;
  fileUri: string;
  diff: string;
  status: PatchProposalStatus;
  createdAt: string;
}

type TimestampFactory = () => string;

export class PatchProposalStore {
  private readonly proposals = new Map<string, PatchProposal>();

  public createProposal(
    input: {
      id?: string;
      sessionId: string;
      fileUri: string;
      diff: string;
    },
    nowFactory: TimestampFactory = () => new Date().toISOString()
  ): PatchProposal {
    const proposal: PatchProposal = {
      id: input.id ?? randomUUID(),
      sessionId: input.sessionId,
      fileUri: input.fileUri,
      diff: input.diff,
      status: "proposed",
      createdAt: nowFactory()
    };

    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  public updateStatus(
    proposalId: string,
    status: PatchProposalStatus
  ): PatchProposal {
    const proposal = this.getById(proposalId);
    if (!proposal) {
      throw new Error(`Patch proposal ${proposalId} was not found.`);
    }

    const updated: PatchProposal = {
      ...proposal,
      status
    };
    this.proposals.set(proposalId, updated);
    return updated;
  }

  public getById(proposalId: string): PatchProposal | undefined {
    return this.proposals.get(proposalId);
  }

  public getBySessionId(sessionId: string): PatchProposal[] {
    return [...this.proposals.values()].filter(
      (proposal) => proposal.sessionId === sessionId
    );
  }
}
