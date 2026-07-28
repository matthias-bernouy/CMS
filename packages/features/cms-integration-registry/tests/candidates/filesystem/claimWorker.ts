import { FsIntegrationRegistryCandidateStore } from "@bernouy/cms-integration-registry/fs";

const [root, candidateId, attemptId, workerId] = process.argv.slice(2);
if (!root || !candidateId || !attemptId || !workerId) {
    throw new Error("Candidate claim worker arguments are missing");
}

const store = new FsIntegrationRegistryCandidateStore({ root });
try {
    const record = await store.claim(candidateId, {
        expectedRevision: 2,
        jobId: "job-concurrent",
        attemptId,
        workerId,
        now: "2026-07-26T10:03:00.000Z",
        leaseExpiresAt: "2026-07-26T10:05:00.000Z",
    });
    process.stdout.write(JSON.stringify({ outcome: "claimed", attemptId, revision: record.revision }));
} catch (error) {
    process.stdout.write(
        JSON.stringify({
            outcome: "failed",
            attemptId,
            code: error instanceof Error && "code" in error ? error.code : "unexpected",
            message: error instanceof Error ? error.message : String(error),
        }),
    );
}
