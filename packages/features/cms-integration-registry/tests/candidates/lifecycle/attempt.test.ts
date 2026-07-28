import { describe, expect, test } from "bun:test";
import {
    advanceIntegrationRegistryCandidate,
    claimIntegrationRegistryCandidate,
    completeIntegrationRegistryCandidateAttempt,
    queueIntegrationRegistryCandidate,
    recoverExpiredIntegrationRegistryCandidateLease,
    renewIntegrationRegistryCandidateLease,
} from "@bernouy/cms-integration-registry";
import { candidateAdmission, candidateJobResult, candidatePolicy } from "../filesystem/fixtures";
import { candidateIdentity, completeCandidate, queueCandidate, TIMES } from "./fixture";

describe("integration registry candidate attempts", () => {
    test("attaches an immutable admission plan and derives a successful completion", async () => {
        const identity = await candidateIdentity();
        const queued = await queueCandidate(identity.record, identity);
        const running = claim(queued);
        const renewed = renewIntegrationRegistryCandidateLease(running, {
            expectedRevision: running.revision,
            attemptId: "attempt-1",
            fencingToken: 1,
            now: TIMES.renewed,
            leaseExpiresAt: TIMES.extendedLease,
        });
        const passed = await completeIntegrationRegistryCandidateAttempt(renewed, {
            expectedRevision: renewed.revision,
            now: TIMES.complete,
            result: await candidateJobResult(identity),
            policy: await candidatePolicy(),
            admission: await candidateAdmission(identity),
        });

        expect(passed).toMatchObject({ status: "passed", revision: 5, attemptCount: 1 });
        expect(passed.policyDigest).toMatch(/^[a-f0-9]{64}$/);
        expect(passed.admissionInputDigest).toMatch(/^[a-f0-9]{64}$/);
        expect(passed.admissionJobResultDigest).toMatch(/^[a-f0-9]{64}$/);
        expect(passed.lease).toBeUndefined();
        expect(() =>
            advanceIntegrationRegistryCandidate(passed, {
                expectedRevision: passed.revision,
                status: "publishing" as "expired",
                now: "2026-07-26T10:07:00.000Z",
            }),
        ).toThrow(/cannot transition/);
    });

    test("rejects a result for another attempt and an expired lease", async () => {
        const identity = await candidateIdentity();
        const running = claim(await queueCandidate(identity.record, identity));
        await expect(
            completeIntegrationRegistryCandidateAttempt(running, {
                expectedRevision: running.revision,
                now: TIMES.renewed,
                result: await candidateJobResult(identity, { attemptId: "attempt-other" }),
                policy: await candidatePolicy(),
                admission: await candidateAdmission(identity),
            }),
        ).rejects.toThrow(/lease is no longer current/);
        await expect(
            completeIntegrationRegistryCandidateAttempt(running, {
                expectedRevision: running.revision,
                now: TIMES.lease,
                result: await candidateJobResult(identity),
                policy: await candidatePolicy(),
                admission: await candidateAdmission(identity),
            }),
        ).rejects.toMatchObject({ code: "lease_expired" });
    });

    test("derives suite rejection and retryable infrastructure failure from suite results", async () => {
        const identity = await candidateIdentity();
        const rejected = await completeCandidate(await queueCandidate(identity.record, identity), identity, "failed");
        expect(rejected).toMatchObject({ status: "rejected", lastFailure: { kind: "suite" } });

        const retryIdentity = await candidateIdentity("candidate-retry");
        const retried = await completeCandidate(
            await queueCandidate(retryIdentity.record, retryIdentity),
            retryIdentity,
            "infrastructure-failure",
        );
        expect(retried).toMatchObject({ status: "queued", lastFailure: { kind: "infrastructure" } });
        expect(retried.admissionJobResultDigest).toMatch(/^[a-f0-9]{64}$/);
    });

    test("never grants or renews a worker lease beyond candidate expiry", async () => {
        const identity = await candidateIdentity();
        const queued = await queueCandidate(identity.record, identity);
        expect(() => claim(queued, "2026-07-27T10:00:00.001Z")).toThrow(/cannot exceed/);

        const running = claim(queued);
        expect(() =>
            renewIntegrationRegistryCandidateLease(running, {
                expectedRevision: running.revision,
                attemptId: "attempt-1",
                fencingToken: 1,
                now: TIMES.renewed,
                leaseExpiresAt: "2026-07-27T10:00:00.001Z",
            }),
        ).toThrow(/cannot exceed/);
    });

    test("recovers an expired worker lease without changing its immutable admission plan", async () => {
        const identity = await candidateIdentity();
        const running = claim(await queueCandidate(identity.record, identity));
        const recovered = recoverExpiredIntegrationRegistryCandidateLease(running, {
            expectedRevision: running.revision,
            now: TIMES.lease,
        });

        expect(recovered).toMatchObject({ status: "queued", lastFailure: { code: "lease_expired" } });
        expect(recovered.policyDigest).toBe(running.policyDigest);
        expect(recovered.admissionInputDigest).toBe(running.admissionInputDigest);
    });
});

function claim(queued: Awaited<ReturnType<typeof queueIntegrationRegistryCandidate>>, leaseExpiresAt = TIMES.lease) {
    return claimIntegrationRegistryCandidate(queued, {
        expectedRevision: queued.revision,
        jobId: "job-1",
        attemptId: "attempt-1",
        fencingToken: 1,
        workerId: "worker-1",
        now: TIMES.claimed,
        leaseExpiresAt,
    });
}
