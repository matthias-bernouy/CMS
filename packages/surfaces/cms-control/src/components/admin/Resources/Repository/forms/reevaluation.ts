import type { RepositoryVersionSelection } from "../contracts/types";
import { optionalField, requiredField } from "./fields";

export function readRepositoryReevaluation(
    form: HTMLFormElement,
    selection: RepositoryVersionSelection,
): Readonly<{
    kind: string;
    version: string;
    currentReportRevisionId: string;
    reason: string;
    evidenceIds?: readonly string[];
}> {
    const evidenceIds = splitEvidenceIds(optionalField(form, "evidenceIds"));
    return {
        ...selection,
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
