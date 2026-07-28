import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
    FsIntegrationRegistryCandidateStore,
    FsIntegrationRegistryCandidateStoreError,
} from "@bernouy/cms-integration-registry/fs";
import {
    CANDIDATE_TIMES,
    candidateJobResult,
    candidateStoreFixture,
    createCandidate,
    queueCandidate,
} from "./fixtures";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe("filesystem integration registry candidate store", () => {
    test("persists immutable objects before restart-safe canonical metadata", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        const uploaded = await createCandidate(fixture);
        const restarted = new FsIntegrationRegistryCandidateStore({ root: fixture.root });

        expect(await restarted.get(fixture.candidateId)).toEqual(uploaded);
        expect((await restarted.objects(fixture.candidateId)).package.kind).toBe("example");
        expect(uploaded.requestedChannel).toBe("latest");
        const privateRoot = join(fixture.root, ".registry", "candidates");
        expect(existsSync(join(privateRoot, "objects", "packages", `${uploaded.packageDigest}.json`))).toBeTrue();
        expect(
            existsSync(join(privateRoot, "objects", "verifications", `${uploaded.verificationDigest}.json`)),
        ).toBeTrue();
        expect(existsSync(join(fixture.root, "versions"))).toBeFalse();
        expect(readdirSync(join(privateRoot, "records", fixture.candidateId))).toEqual(["0000000000000000.json"]);
    });

    test("reuses identical content-addressed objects without replacing them", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        const first = await createCandidate(fixture);
        const objectPath = join(
            fixture.root,
            ".registry",
            "candidates",
            "objects",
            "packages",
            `${first.packageDigest}.json`,
        );
        const identity = statSync(objectPath).ino;
        await fixture.store.create({
            candidateId: "candidate-2",
            candidate: fixture.candidate,
            createdAt: CANDIDATE_TIMES.created,
            expiresAt: CANDIDATE_TIMES.expires,
        });

        expect(statSync(objectPath).ino).toBe(identity);
        await expect(createCandidate(fixture)).rejects.toMatchObject({ code: "candidate_exists" });
        await expect(
            fixture.store.create({
                candidateId: fixture.candidateId,
                candidate: { ...fixture.candidate, packageDigest: "f".repeat(64) },
                createdAt: CANDIDATE_TIMES.created,
                expiresAt: CANDIDATE_TIMES.expires,
            }),
        ).rejects.toMatchObject({ code: "candidate_exists" });
    });

    test("persists lifecycle revisions and allocates monotonically fenced claims", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        const queued = await queueCandidate(fixture);
        const running = await fixture.store.claim(fixture.candidateId, {
            expectedRevision: queued.revision,
            jobId: "job-1",
            attemptId: "attempt-1",
            workerId: "worker-1",
            now: CANDIDATE_TIMES.claimed,
            leaseExpiresAt: CANDIDATE_TIMES.lease,
        });
        const retried = await fixture.store.complete(fixture.candidateId, {
            expectedRevision: running.revision,
            now: CANDIDATE_TIMES.completed,
            result: await candidateJobResult(fixture, { outcome: "infrastructure-failure" }),
        });
        const second = await fixture.store.claim(fixture.candidateId, {
            expectedRevision: retried.revision,
            jobId: "job-1",
            attemptId: "attempt-2",
            workerId: "worker-2",
            now: CANDIDATE_TIMES.expiredLease,
            leaseExpiresAt: "2026-07-26T10:07:00.000Z",
        });

        expect(second).toMatchObject({ status: "running", attemptCount: 2, lease: { fencingToken: 2 } });
        expect(await fixture.store.listClaimable(CANDIDATE_TIMES.expiredLease)).toEqual([]);
        expect(readdirSync(join(fixture.root, ".registry", "candidates", "records", fixture.candidateId))).toHaveLength(
            6,
        );
    });

    test("fails closed when a candidate does not exist", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        await expect(fixture.store.objects("missing")).rejects.toBeInstanceOf(FsIntegrationRegistryCandidateStoreError);
    });

    test("never exposes or claims a queued candidate after its TTL", async () => {
        const fixture = await candidateStoreFixture("candidate-expired", "2026-07-26T10:02:30.000Z");
        cleanup = fixture.cleanup;
        const queued = await queueCandidate(fixture);

        expect(await fixture.store.listClaimable("2026-07-26T10:03:00.000Z")).toEqual([]);
        await expect(
            fixture.store.claim(fixture.candidateId, {
                expectedRevision: queued.revision,
                jobId: "job-expired",
                attemptId: "attempt-expired",
                workerId: "worker-expired",
                now: "2026-07-26T10:03:00.000Z",
                leaseExpiresAt: "2026-07-26T10:05:00.000Z",
            }),
        ).rejects.toMatchObject({ code: "invalid_candidate" });

        expect(await fixture.store.expireDueCandidates("2026-07-26T10:03:00.000Z")).toMatchObject([
            { status: "expired" },
        ]);
        expect(await fixture.store.expireDueCandidates("2026-07-26T10:03:00.000Z")).toEqual([]);
    });

    test("sweeps expired leases at the exact boundary without requiring a process restart", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        const queued = await queueCandidate(fixture);
        await fixture.store.claim(fixture.candidateId, {
            expectedRevision: queued.revision,
            jobId: "job-sweep",
            attemptId: "attempt-sweep",
            workerId: "worker-sweep",
            now: "2026-07-26T10:03:00.000Z",
            leaseExpiresAt: "2026-07-26T10:04:00.000Z",
        });

        expect(await fixture.store.recoverExpiredLeases("2026-07-26T10:04:00.000Z")).toMatchObject([
            { status: "queued", lastFailure: { code: "lease_expired" } },
        ]);
        expect(await fixture.store.recoverExpiredLeases("2026-07-26T10:04:00.000Z")).toEqual([]);
    });

    test("recovers then expires a running candidate at its TTL without a restart", async () => {
        const fixture = await candidateStoreFixture("running-ttl", "2026-07-26T10:04:00.000Z");
        cleanup = fixture.cleanup;
        const queued = await queueCandidate(fixture);
        await fixture.store.claim(fixture.candidateId, {
            expectedRevision: queued.revision,
            jobId: "job-ttl",
            attemptId: "attempt-ttl",
            workerId: "worker-ttl",
            now: "2026-07-26T10:03:00.000Z",
            leaseExpiresAt: "2026-07-26T10:04:00.000Z",
        });

        expect(await fixture.store.recoverExpiredLeases("2026-07-26T10:04:00.000Z")).toMatchObject([
            { status: "queued" },
        ]);
        expect(await fixture.store.expireDueCandidates("2026-07-26T10:04:00.000Z")).toMatchObject([
            { status: "expired", lastFailure: { code: "lease_expired" } },
        ]);
    });
});
