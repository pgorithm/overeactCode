import { PatchProposal } from "./patchProposal";

export interface StructuredFileEditRequest {
  proposal: PatchProposal;
}

export class PatchEditingBoundary {
  public createEditRequest(input: StructuredFileEditRequest): StructuredFileEditRequest {
    if (input.proposal.status !== "proposed") {
      throw new Error(
        `Patch proposal ${input.proposal.id} must be in proposed status before requesting file edits.`
      );
    }

    if (input.proposal.diff.trim().length === 0) {
      throw new Error(
        `Patch proposal ${input.proposal.id} must include a non-empty structured diff.`
      );
    }

    return {
      proposal: input.proposal
    };
  }

  public rejectBlindTextReplacement(input: { fileUri: string; replacementText: string }): never {
    throw new Error(
      `Blind text replacement is not allowed for ${input.fileUri}. Use a structured PatchProposal diff instead.`
    );
  }
}
