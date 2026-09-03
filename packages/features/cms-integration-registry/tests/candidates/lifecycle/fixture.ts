import {
    advanceIntegrationRegistryCandidate,
    claimIntegrationRegistryCandidate,
    completeIntegrationRegistryCandidateAttempt,
    createIntegrationRegistryCandidateRecord,
    queueIntegrationRegistryCandidate,
} from "@bernouy/cms-integration-registry";
import { candidateAdmission, candidateJobResult, candidatePolicy, candidateValue } from "../filesystem/fixtures";

export const TIMES = {
    created: "2026-07-26T10:00:00.000Z",
    validating: "2026-07-26T10:01:00.000Z",
    queued: "2026-07-26T10:02:00.000Z",
    claimed: "2026-07-26T10:03:00.000Z",
    renewed: "2026-07-26T10:04:00.000Z",
    lease: "2026-07-26T10:05:00.000Z",
    extendedLease: "2026-07-26T10:06:00.000Z",
    complete: "2026-07-26T10:05:30.000Z",
    expires: "2026-07-27T10:00:00.000Z",
} as const;

export async function candidateIdentity(candidateId = "candidate-1") {
    const candidate = await candidateValue();
    return {
        candidateId,
        candidate,
        record: createIntegrationRegistryCandidateRecord({
            candidateId,
            candidate,
            createdAt: TIMES.created,
            expiresAt: TIMES.expires,
        }),
    };
}

export async function queueCandidate(
    uploaded: Awaited<ReturnType<typeof candidateIdentity>>["record"],
    identity: Awaited<ReturnType<typeof candidateIdentity>>,
) {
    const validating = advanceIntegrationRegistryCandidate(uploaded, {
        expectedRevision: uploaded.revision,
        status: "validating",
        now: TIMES.validating,
    });
    return await queueIntegrationRegistryCandidate(validating, {
        expectedRevision: validating.revision,
        now: TIMES.queued,
        policy: await candidatePolicy(),
        admission: await candidateAdmission(identity),
    });
}

export async function completeCandidate(
    queued: Awaited<ReturnType<typeof queueCandidate>>,
    identity: Awaited<ReturnType<typeof candidateIdentity>>,
    outcome: "failed" | "infrastructure-failure",
) {
    const running = claimIntegrationRegistryCandidate(queued, {
        expectedRevision: queued.revision,
        jobId: "job-1",
        attemptId: "attempt-1",
        fencingToken: 1,
        workerId: "worker-1",
        now: TIMES.claimed,
        leaseExpiresAt: TIMES.lease,
        maximumAttempts: 2,
    });
    return await completeIntegrationRegistryCandidateAttempt(running, {
        expectedRevision: running.revision,
        now: TIMES.renewed,
        result: await candidateJobResult(identity, { outcome }),
        policy: await candidatePolicy(),
        admission: await candidateAdmission(identity),
    });
}
