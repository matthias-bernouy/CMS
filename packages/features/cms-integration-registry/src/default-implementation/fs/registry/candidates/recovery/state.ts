import { IntegrationRegistryCandidateError } from "cms-integration-registry/core/publication/candidates/errors";
import { FsIntegrationRegistryCandidateStore } from "../store";
import type { FsIntegrationRegistryCandidateRecoveryDiagnostic } from "./types";

export async function recoverCandidateState(
    store: FsIntegrationRegistryCandidateStore,
    candidateId: string,
    now: string,
    diagnostics: FsIntegrationRegistryCandidateRecoveryDiagnostic[],
): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const record = await store.get(candidateId);
        if (!record) {
            return;
        }
        try {
            if (
                record.status === "running" &&
                record.lease &&
                Date.parse(now) >= Date.parse(record.lease.leaseExpiresAt)
            ) {
                await store.recoverExpiredLease(candidateId, { expectedRevision: record.revision, now });
                diagnostics.push({
                    code: "lease_recovered",
                    path: candidateId,
                    message: `Recovered expired lease for candidate ${candidateId}`,
                });
                continue;
            }
            if (isExpiredUnclaimedCandidate(record, now)) {
                await store.expire(candidateId, record.revision, now);
                diagnostics.push({
                    code: "expired",
                    path: candidateId,
                    message: `Expired candidate ${candidateId}`,
                });
            }
            return;
        } catch (error) {
            if (error instanceof IntegrationRegistryCandidateError && error.code === "revision_conflict") {
                continue;
            }
            throw error;
        }
    }
    throw new IntegrationRegistryCandidateError(
        "revision_conflict",
        `Candidate ${candidateId} kept changing during recovery`,
    );
}

function isExpiredUnclaimedCandidate(
    record: Readonly<{ status: string; expiresAt: string; updatedAt: string }>,
    now: string,
): boolean {
    return (
        (record.status === "uploaded" || record.status === "validating" || record.status === "queued") &&
        Date.parse(now) >= Date.parse(record.expiresAt) &&
        Date.parse(now) >= Date.parse(record.updatedAt)
    );
}
