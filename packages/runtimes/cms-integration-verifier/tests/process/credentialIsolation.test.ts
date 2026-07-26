import { describe, expect, test } from "bun:test";
import {
    createHttpCandidateWorkerClient,
    createVerificationSupervisor,
    type VerificationSandboxInput,
} from "../../src";
import { runnerFixture } from "../fixtures/contracts";
import { validJobResult } from "../fixtures/result";
import { pausedScheduler } from "../fixtures/fakeWorker";
import { claimedJob, queuedCandidate } from "../fixtures/workload";

describe("supervisor-to-sandbox isolation", () => {
    test("keeps real worker authentication out of a sandbox that recursively inspects its input", async () => {
        const workerToken = "real-worker-service-token";
        const signingKey = "repository-capability-signing-key";
        const queued = await queuedCandidate();
        const claimed = await claimedJob();
        const requests: Request[] = [];
        let sandboxView = "";
        let submittedBody = "";
        const responses = [
            json({ candidates: [queued] }),
            json({ candidate: claimed.candidate, workload: claimed.workload }, 201),
        ];
        const client = createHttpCandidateWorkerClient({
            repositoryUrl: "http://repository.internal",
            workerId: "worker-1",
            workerToken,
            requestTimeoutMs: 1_000,
            maxResponseBytes: 4 * 1_048_576,
            fetch: async (input, init) => {
                const request = new Request(input, init);
                requests.push(request.clone());
                if (responses.length > 0) {
                    return responses.shift()!;
                }
                const body = await request.json();
                if (requests.length === 3) {
                    return json(
                        {
                            capability: {
                                token: "capability-only-token",
                                expiresAt: claimed.candidate.lease.leaseExpiresAt,
                                resultDigest: body.resultDigest,
                            },
                        },
                        201,
                    );
                }
                submittedBody = JSON.stringify(body);
                return json({
                    candidate: {
                        ...claimed.candidate,
                        revision: claimed.candidate.revision + 1,
                        status: "passed",
                        lease: undefined,
                    },
                });
            },
        });
        const supervisor = createVerificationSupervisor({
            client,
            scheduler: pausedScheduler(),
            jobListLimit: 1,
            leaseRenewalIntervalMs: 30_000,
            databases: disposableDatabase(),
            sandbox: {
                identity: runnerFixture(),
                async run(input) {
                    sandboxView = recursivelyInspect(input);
                    return await validJobResult(claimed);
                },
            },
        });

        await expect(supervisor.runNext()).resolves.toMatchObject({ outcome: "submitted", status: "passed" });

        expect(sandboxView).not.toContain(workerToken);
        expect(sandboxView).not.toContain(signingKey);
        expect(
            requests.slice(0, 3).every((request) => request.headers.get("authorization") === `Bearer ${workerToken}`),
        ).toBe(true);
        expect(requests[3]!.headers.get("authorization")).toBe("Bearer capability-only-token");
        expect(requests[3]!.headers.get("authorization")).not.toContain(workerToken);
        expect(submittedBody).not.toContain(workerToken);
        expect(Object.keys(JSON.parse(sandboxView))).toEqual(["workload", "database"]);
    });
});

function recursivelyInspect(input: VerificationSandboxInput): string {
    const copy = Object.fromEntries(
        Object.getOwnPropertyNames(input).map((key) => [key, (input as unknown as Record<string, unknown>)[key]]),
    );
    return JSON.stringify(copy);
}

function disposableDatabase() {
    return {
        async acquire() {
            return {
                credential: {
                    databaseId: "database-1",
                    connectionUri: "postgresql://ephemeral:database-secret@postgres:5432/cmscore_contracts_1",
                },
                async release() {},
            };
        },
    };
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}
