import type { RepositoryVersionSelection } from "../contracts/types";
import { RepositoryFormError, requiredField } from "./fields";

export function readRepositoryVersionBlock(form: HTMLFormElement, selection: RepositoryVersionSelection) {
    if (!selection.decision) {
        throw new RepositoryFormError("This version has no composite release decision to block.");
    }
    const version = requiredField(form, "blockVersion", "Version confirmation");
    const decisionDigest = requiredField(form, "blockDecisionDigest", "Decision digest confirmation");
    if (version !== selection.version || decisionDigest !== selection.decision.digest) {
        throw new RepositoryFormError("Type the exact version and release decision digest to confirm blocking.");
    }
    return {
        kind: selection.kind,
        version: selection.version,
        currentDecision: {
            revisionId: selection.decision.revisionId,
            digest: selection.decision.digest,
        },
        reason: requiredField(form, "reason", "Blocking reason"),
        confirmation: {
            action: "block" as const,
            kind: selection.kind,
            version: selection.version,
            decisionRevisionId: selection.decision.revisionId,
            decisionDigest: selection.decision.digest,
        },
    };
}
