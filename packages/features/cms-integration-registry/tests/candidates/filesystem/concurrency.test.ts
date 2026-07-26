import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { candidateJobResult, candidateStoreFixture, queueCandidate } from "./fixtures";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe("filesystem integration registry candidate concurrency", () => {
    test("chooses exactly one cross-process claim with atomic revision CAS", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        await queueCandidate(fixture);
        const results = await Promise.all([
            runClaimWorker(fixture.root, fixture.candidateId, "attempt-a", "worker-a"),
            runClaimWorker(fixture.root, fixture.candidateId, "attempt-b", "worker-b"),
        ]);

        expect(results.filter((result) => result.outcome === "claimed")).toHaveLength(1);
        expect(results.filter((result) => result.code === "revision_conflict")).toHaveLength(1);
        const current = await fixture.store.get(fixture.candidateId);
        expect(current).toMatchObject({ revision: 3, status: "running", attemptCount: 1 });
        expect(current?.lease?.fencingToken).toBe(1);
    });

    test("rejects a late result after lease recovery and a fenced reclaim", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        const queued = await queueCandidate(fixture);
        const first = await fixture.store.claim(fixture.candidateId, {
            expectedRevision: queued.revision,
            jobId: "job-1",
            attemptId: "attempt-1",
            workerId: "worker-1",
            now: "2026-07-26T10:03:00.000Z",
            leaseExpiresAt: "2026-07-26T10:04:00.000Z",
        });
        const recovered = await fixture.store.recoverExpiredLease(fixture.candidateId, {
            expectedRevision: first.revision,
            now: "2026-07-26T10:04:00.000Z",
        });
        const second = await fixture.store.claim(fixture.candidateId, {
            expectedRevision: recovered.revision,
            jobId: "job-1",
            attemptId: "attempt-2",
            workerId: "worker-2",
            now: "2026-07-26T10:04:01.000Z",
            leaseExpiresAt: "2026-07-26T10:06:00.000Z",
        });

        await expect(
            fixture.store.complete(fixture.candidateId, {
                expectedRevision: second.revision,
                now: "2026-07-26T10:04:02.000Z",
                result: await candidateJobResult(fixture, { attemptId: "attempt-1", fencingToken: 1 }),
            }),
        ).rejects.toMatchObject({ code: "lease_conflict" });
        expect((await fixture.store.get(fixture.candidateId))?.lease?.fencingToken).toBe(2);
    });
});

async function runClaimWorker(root: string, candidateId: string, attemptId: string, workerId: string) {
    const childProcess = Bun.spawn(
        [process.execPath, join(import.meta.dir, "claimWorker.ts"), root, candidateId, attemptId, workerId],
        { stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
        childProcess.exited,
        new Response(childProcess.stdout).text(),
        new Response(childProcess.stderr).text(),
    ]);
    if (exitCode !== 0) {
        throw new Error(`Candidate claim worker exited ${exitCode}: ${stderr}`);
    }
    return JSON.parse(stdout) as Readonly<{
        outcome: "claimed" | "failed";
        attemptId: string;
        revision?: number;
        code?: string;
    }>;
}
