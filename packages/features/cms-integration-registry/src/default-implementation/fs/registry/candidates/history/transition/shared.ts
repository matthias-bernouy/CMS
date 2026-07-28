import { isDeepStrictEqual } from "node:util";
import type { IntegrationRegistryCandidateRecord } from "cms-integration-registry/interfaces/publication";
import { FsIntegrationRegistryCandidateStoreError } from "../../errors";

export function assertStableIdentity(
    previous: IntegrationRegistryCandidateRecord,
    current: IntegrationRegistryCandidateRecord,
): void {
    for (const field of [
        "schema",
        "candidateId",
        "submittedBy",
        "kind",
        "version",
        "candidateDigest",
        "packageDigest",
        "verificationDigest",
        "requestedChannel",
        "createdAt",
        "expiresAt",
    ] as const) {
        if (previous[field] !== current[field]) {
            corrupt(`Candidate ${current.candidateId} changed immutable field ${field}`);
        }
    }
}

export function assertRecordDelta(
    previous: IntegrationRegistryCandidateRecord,
    current: IntegrationRegistryCandidateRecord,
    changed: readonly (keyof IntegrationRegistryCandidateRecord)[],
): void {
    const mutable = new Set<keyof IntegrationRegistryCandidateRecord>(changed);
    for (const field of Object.keys(current) as (keyof IntegrationRegistryCandidateRecord)[]) {
        if (!mutable.has(field) && !isDeepStrictEqual(previous[field], current[field])) {
            corrupt(`Candidate ${current.candidateId} changed forbidden field ${field}`);
        }
    }
    for (const field of Object.keys(previous) as (keyof IntegrationRegistryCandidateRecord)[]) {
        if (!mutable.has(field) && !(field in current)) {
            corrupt(`Candidate ${current.candidateId} removed forbidden field ${field}`);
        }
    }
}

export function corrupt(message: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("corrupt_candidate", message);
}
