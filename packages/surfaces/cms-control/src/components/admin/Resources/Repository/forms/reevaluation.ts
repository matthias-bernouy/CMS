import type { RepositoryVersionSelection } from "../contracts/types";
import { optionalField, requiredField } from "./fields";

export function readRepositoryReevaluation(
    form: HTMLFormElement,
    selection: RepositoryVersionSelection,
): Readonly<{
    kind: string;
    version: string;
    currentReportRevisionId: string;
    currentDecision: Readonly<{ revisionId: string; digest: string }>;
    reason: string;
    evidenceIds?: readonly string[];
}> {
    if (!selection.decision) {
        throw new Error("A current release admission decision is required for reevaluation");
    }
    const evidenceIds = splitEvidenceIds(optionalField(form, "evidenceIds"));
    return {
        kind: selection.kind,
        version: selection.version,
        currentReportRevisionId: selection.currentReportRevisionId,
        currentDecision: {
            revisionId: selection.decision.revisionId,
            digest: selection.decision.digest,
        },
        reason: requiredField(form, "reason", "Reevaluation reason"),
        ...(evidenceIds.length > 0 ? { evidenceIds } : {}),
    };
}

function splitEvidenceIds(value: string | undefined): readonly string[] {
    if (!value) {
        return [];
    }
    return [
        ...new Set(
            value
                .split(/[\n,]/u)
                .map((entry) => entry.trim())
                .filter(Boolean),
        ),
    ].slice(0, 256);
}
