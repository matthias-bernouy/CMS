import type { ReleaseAdmissionDecision } from "../../../interfaces/reports/decision";
import { IntegrationVerificationContractError } from "../../validation/errors";

export function appendReleaseAdmissionDecision(
    history: readonly ReleaseAdmissionDecision[],
    next: ReleaseAdmissionDecision,
): readonly ReleaseAdmissionDecision[] {
    assertReleaseAdmissionDecisionHistory(history);
    const previous = history.at(-1);
    if (!previous) {
        if (next.revisionType !== "root") {
            throw invalid("revisionType", "must be root for the first decision");
        }
        return Object.freeze([next]);
    }
    if (next.revisionType !== "revision" || next.supersedes !== previous.decisionId) {
        throw invalid("supersedes", "must reference the current decision exactly");
    }
    if (!sameReleaseIdentity(next, previous)) {
        throw invalid("", "cannot change the release identity in one decision history");
    }
    if (Date.parse(next.createdAt) < Date.parse(previous.createdAt)) {
        throw invalid("createdAt", "must not precede the current decision");
    }
    return Object.freeze([...history, next]);
}

export function assertReleaseAdmissionDecisionHistory(history: readonly ReleaseAdmissionDecision[]): void {
    const root = history[0];
    const decisionIds = new Set<string>();
    for (const [index, decision] of history.entries()) {
        if (decisionIds.has(decision.decisionId)) {
            throw invalid(`history.${index}.decisionId`, "must be unique in its history");
        }
        decisionIds.add(decision.decisionId);
        if (index === 0 && (decision.revisionType !== "root" || decision.supersedes !== undefined)) {
            throw invalid("history.0", "must be a root decision");
        }
        if (
            index > 0 &&
            (decision.revisionType !== "revision" || decision.supersedes !== history[index - 1]?.decisionId)
        ) {
            throw invalid(`history.${index}.supersedes`, "must reference the preceding decision");
        }
        if (root && !sameReleaseIdentity(decision, root)) {
            throw invalid(`history.${index}`, "must preserve the root release identity");
        }
        const previous = history[index - 1];
        if (previous && Date.parse(decision.createdAt) < Date.parse(previous.createdAt)) {
            throw invalid(`history.${index}.createdAt`, "must not precede the prior decision");
        }
    }
}

function sameReleaseIdentity(left: ReleaseAdmissionDecision, right: ReleaseAdmissionDecision): boolean {
    return left.kind === right.kind && left.version === right.version && left.packageDigest === right.packageDigest;
}

function invalid(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError(
        "invalid_contract",
        `admissionDecision.${field} ${message}`,
        `admissionDecision.${field}`,
    );
}
