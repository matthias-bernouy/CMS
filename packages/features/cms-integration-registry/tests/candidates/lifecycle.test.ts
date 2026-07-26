import { describe, expect, test } from "bun:test";
import { computeIntegrationPackageDigest, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import { validateIntegrationCandidateEnvelope } from "@bernouy/cms-integration-verification";
import {
    advanceIntegrationRegistryCandidate,
    claimIntegrationRegistryCandidate,
    completeIntegrationRegistryCandidateAttempt,
    createIntegrationRegistryCandidateRecord,
    IntegrationRegistryCandidateError,
    recoverExpiredIntegrationRegistryCandidateLease,
    renewIntegrationRegistryCandidateLease,
} from "@bernouy/cms-integration-registry";

const TIMES = {
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

describe("integration registry candidate lifecycle", () => {
    test("follows the successful lifecycle with revision CAS and immutable leases", async () => {
        const uploaded = await candidate();
        const validating = advance(uploaded, "validating", TIMES.validating);
        const queued = advance(validating, "queued", TIMES.queued);
        const running = claim(queued);
        const renewed = renewIntegrationRegistryCandidateLease(running, {
            expectedRevision: running.revision,
            attemptId: "attempt-1",
            fencingToken: 1,
            now: TIMES.renewed,
            leaseExpiresAt: TIMES.extendedLease,
        });
        const passed = completeIntegrationRegistryCandidateAttempt(renewed, {
            expectedRevision: renewed.revision,
            attemptId: "attempt-1",
            fencingToken: 1,
            now: TIMES.complete,
            outcome: "passed",
        });
        const publishing = advance(passed, "publishing", "2026-07-26T10:07:00.000Z");
        const published = advance(publishing, "published", "2026-07-26T10:08:00.000Z");

        expect(published).toMatchObject({ status: "published", revision: 7, attemptCount: 1 });
        expect(passed.lease).toBeUndefined();
        expect(Object.isFrozen(running.lease)).toBeTrue();
        expect(() => advance(published, "validating", "2026-07-26T10:09:00.000Z")).toThrow(/cannot transition/);
    });

    test("rejects stale revisions, expired leases, and late fenced results", async () => {
        const queued = advance(advance(await candidate(), "validating", TIMES.validating), "queued", TIMES.queued);
        const first = claim(queued);
        expect(() => advance(first, "expired", TIMES.expires)).toThrow(/cannot transition/);
        expectCandidateError(
            () =>
                completeIntegrationRegistryCandidateAttempt(first, {
                    expectedRevision: queued.revision,
                    attemptId: "attempt-1",
                    fencingToken: 1,
                    now: TIMES.complete,
                    outcome: "passed",
                }),
            "revision_conflict",
        );
        expectCandidateError(
            () =>
                completeIntegrationRegistryCandidateAttempt(first, {
                    expectedRevision: first.revision,
                    attemptId: "attempt-1",
                    fencingToken: 1,
                    now: "2026-07-26T10:05:01.000Z",
                    outcome: "passed",
                }),
            "lease_expired",
        );

        const retried = completeIntegrationRegistryCandidateAttempt(first, {
            expectedRevision: first.revision,
            attemptId: "attempt-1",
            fencingToken: 1,
            now: TIMES.renewed,
            outcome: "infrastructure-failure",
            failure: failure("infrastructure", "runner_unavailable", TIMES.renewed),
        });
        const second = claimIntegrationRegistryCandidate(retried, {
            expectedRevision: retried.revision,
            jobId: "job-1",
            attemptId: "attempt-2",
            fencingToken: 2,
            workerId: "worker-2",
            now: TIMES.complete,
            leaseExpiresAt: TIMES.extendedLease,
        });
        expectCandidateError(
            () =>
                completeIntegrationRegistryCandidateAttempt(second, {
                    expectedRevision: second.revision,
                    attemptId: "attempt-1",
                    fencingToken: 1,
                    now: TIMES.complete,
                    outcome: "passed",
                }),
            "lease_conflict",
        );
    });

    test("distinguishes suite rejection, infrastructure retry, stale publication, and TTL expiry", async () => {
        const queued = advance(advance(await candidate(), "validating", TIMES.validating), "queued", TIMES.queued);
        const running = claim(queued);
        const rejected = completeIntegrationRegistryCandidateAttempt(running, {
            expectedRevision: running.revision,
            attemptId: "attempt-1",
            fencingToken: 1,
            now: TIMES.renewed,
            outcome: "rejected",
            failure: failure("suite", "contract_failed", TIMES.renewed),
        });
        expect(rejected).toMatchObject({ status: "rejected", lastFailure: { kind: "suite" } });

        const passed = completeIntegrationRegistryCandidateAttempt(claim(queued), {
            expectedRevision: queued.revision + 1,
            attemptId: "attempt-1",
            fencingToken: 1,
            now: TIMES.renewed,
            outcome: "passed",
        });
        const publishing = advance(passed, "publishing", TIMES.complete);
        const stale = advanceIntegrationRegistryCandidate(publishing, {
            expectedRevision: publishing.revision,
            status: "queued",
            now: TIMES.extendedLease,
            failure: failure("stale", "baseline_changed", TIMES.extendedLease),
        });
        expect(stale.status).toBe("queued");

        const expiring = await candidate();
        const expired = advance(expiring, "expired", TIMES.expires);
        expect(expired.status).toBe("expired");
    });

    test("fails closed on malformed identity, time, failure, and direct running transitions", async () => {
        const uploaded = await candidate();
        expect(() =>
            createIntegrationRegistryCandidateRecord({
                candidateId: "../escape",
                candidate: candidateValue,
                createdAt: TIMES.created,
                expiresAt: TIMES.expires,
            }),
        ).toThrow(IntegrationRegistryCandidateError);
        expectCandidateError(() => advance(uploaded, "queued", TIMES.queued), "invalid_transition");
        expect(() => advance(uploaded, "expired", TIMES.created)).toThrow(/before expiresAt/);
    });

    test("recovers an expired worker lease with a fenced infrastructure retry", async () => {
        const queued = advance(advance(await candidate(), "validating", TIMES.validating), "queued", TIMES.queued);
        const running = claim(queued);
        expect(() =>
            recoverExpiredIntegrationRegistryCandidateLease(running, {
                expectedRevision: running.revision,
                now: TIMES.renewed,
            }),
        ).toThrow(/has not expired/);

        const recovered = recoverExpiredIntegrationRegistryCandidateLease(running, {
            expectedRevision: running.revision,
            now: "2026-07-26T10:05:01.000Z",
        });

        expect(recovered).toMatchObject({
            revision: running.revision + 1,
            status: "queued",
            lastFailure: { kind: "infrastructure", code: "lease_expired" },
        });
        expect(recovered.lease).toBeUndefined();
        expect(Object.isFrozen(recovered.lastFailure)).toBeTrue();
    });
});

let candidateValue: Awaited<ReturnType<typeof validateIntegrationCandidateEnvelope>>;

async function candidate() {
    candidateValue ??= await validateIntegrationCandidateEnvelope(await candidateEnvelope());
    return createIntegrationRegistryCandidateRecord({
        candidateId: "candidate-1",
        candidate: candidateValue,
        createdAt: TIMES.created,
        expiresAt: TIMES.expires,
    });
}

async function candidateEnvelope() {
    const packageEnvelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind: "example",
        version: "1.2.0",
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: "{}" },
            "release-notes.md": { encoding: "utf8", content: "Release" },
        },
    };
    const packageDigest = await computeIntegrationPackageDigest(packageEnvelope);
    return {
        schema: "cms.integration.candidate.v1",
        package: packageEnvelope,
        verification: {
            schema: "cms.integration.verification.v1",
            target: { kind: "example", version: "1.2.0", packageDigest },
            manifest: {
                runnerRequirements: [{ name: "cms-postgres", versionRange: "^1.0.0" }],
                contracts: [],
                conformance: [],
                fixtures: [],
            },
            files: {},
        },
        submission: {},
    };
}

function advance(
    record: Awaited<ReturnType<typeof candidate>>,
    status: Parameters<typeof advanceIntegrationRegistryCandidate>[1]["status"],
    now: string,
) {
    return advanceIntegrationRegistryCandidate(record, { expectedRevision: record.revision, status, now });
}

function claim(record: Awaited<ReturnType<typeof candidate>>) {
    return claimIntegrationRegistryCandidate(record, {
        expectedRevision: record.revision,
        jobId: "job-1",
        attemptId: "attempt-1",
        fencingToken: 1,
        workerId: "worker-1",
        now: TIMES.claimed,
        leaseExpiresAt: TIMES.lease,
    });
}

function failure(kind: "validation" | "suite" | "infrastructure" | "stale", code: string, occurredAt: string) {
    return { kind, code, message: code.replaceAll("_", " "), occurredAt } as const;
}

function expectCandidateError(action: () => unknown, code: IntegrationRegistryCandidateError["code"]): void {
    try {
        action();
        throw new Error("Expected candidate operation to fail");
    } catch (error) {
        expect(error).toBeInstanceOf(IntegrationRegistryCandidateError);
        expect(error).toMatchObject({ code });
    }
}
