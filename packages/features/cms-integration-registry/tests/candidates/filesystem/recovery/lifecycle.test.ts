import { afterEach, describe, expect, test } from "bun:test";
import {
    FsIntegrationRegistryCandidateStore,
    recoverFsIntegrationRegistryCandidates,
} from "@bernouy/cms-integration-registry/fs";
import { candidateStoreFixture, queueCandidate } from "../fixtures";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe("filesystem candidate lifecycle recovery", () => {
    test("recovers expired claims, then applies candidate TTL deterministically", async () => {
        const fixture = await candidateStoreFixture("candidate-ttl", "2026-07-26T10:04:30.000Z");
        cleanup = fixture.cleanup;
        const queued = await queueCandidate(fixture);
        await fixture.store.claim(fixture.candidateId, {
            expectedRevision: queued.revision,
            jobId: "job-1",
            attemptId: "attempt-1",
            workerId: "worker-1",
            now: "2026-07-26T10:03:00.000Z",
            leaseExpiresAt: "2026-07-26T10:04:00.000Z",
        });

        const result = await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-26T10:05:01.000Z",
        });
        const restarted = new FsIntegrationRegistryCandidateStore({ root: fixture.root });

        expect(result).toMatchObject({ recoveredLeases: 1, expiredCandidates: 1, quarantinedEntries: 0 });
        expect(await restarted.get(fixture.candidateId)).toMatchObject({
            revision: 5,
            status: "expired",
            attemptCount: 1,
            lastFailure: { code: "lease_expired" },
        });
    });
});
