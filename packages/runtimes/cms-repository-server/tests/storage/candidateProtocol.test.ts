import { afterEach, describe, expect, test } from "bun:test";
import { identifyCandidateAdmissionJobResult } from "@bernouy/cms-integration-verification";
import { createRepositoryManagementGuard, createRepositoryWorkerGuard } from "@bernouy/cms-repository-management";
import { BunRunner, type Runner } from "@bernouy/http-runner";
import { serveForTest, type TestServer } from "@bernouy/http-runner/testing";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { createProductionRepositoryCandidateProtocol } from "../../src/core/candidates/composition";
import { TemporaryRoots } from "./fixtures";
import {
    runtimeAdmissionPlan,
    runtimeCandidateValue,
    runtimeJobResult,
    runtimeJsonRequest,
} from "./candidateProtocolValues";

const roots = new TemporaryRoots();
const servers: TestServer[] = [];
const BASE = "/.cms/repository-management";

afterEach(async () => {
    for (const server of servers.splice(0)) {
        server.stop();
    }
    await roots.cleanup();
});

describe("production candidate protocol recovery", () => {
    test("recovers an expired lease across restart, fences the old result, and preserves exact replay", async () => {
        const root = await roots.create();
        const candidate = await runtimeCandidateValue();
        const clock = { value: "2026-07-26T10:00:00.000Z" };
        const first = await startProtocol(root, clock, candidate);
        const submission = await runtimeJsonRequest(
            first.server,
            "POST",
            "/api/integrations/candidates",
            candidate.envelope,
            "management-secret",
        );
        expect(submission.status).toBe(202);
        const queued = (await submission.json()).candidate;
        expect(queued.status).toBe("queued");

        clock.value = "2026-07-26T10:03:00.000Z";
        const firstClaim = await runtimeJsonRequest(
            first.server,
            "POST",
            "/api/integrations/verification-jobs/claims",
            { candidateId: queued.candidateId, expectedRevision: queued.revision, workerId: "worker-1" },
            "worker-secret",
        );
        expect(firstClaim.status).toBe(201);
        const running = (await firstClaim.json()).candidate;
        expect(running.lease.fencingToken).toBe(1);
        const oldResult = await runtimeJobResult(queued.candidateId, candidate, running.lease);
        const oldDigest = (await identifyCandidateAdmissionJobResult(oldResult)).digest;
        clock.value = "2026-07-26T10:04:00.000Z";
        const oldCapability = await seal(first.server, running, oldDigest);
        first.server.stop();
        servers.splice(servers.indexOf(first.server), 1);

        clock.value = "2026-07-26T10:05:01.000Z";
        const restarted = await startProtocol(root, clock, candidate);
        expect(restarted.recoveredLeases).toBe(1);
        const jobs = await restarted.server.request("GET", `${BASE}/api/integrations/verification-jobs`, {
            headers: { authorization: "Bearer worker-secret" },
        });
        const recovered = (await jobs.json()).candidates[0];
        expect(recovered.status).toBe("queued");
        const secondClaim = await runtimeJsonRequest(
            restarted.server,
            "POST",
            "/api/integrations/verification-jobs/claims",
            { candidateId: recovered.candidateId, expectedRevision: recovered.revision, workerId: "worker-2" },
            "worker-secret",
        );
        const rerun = (await secondClaim.json()).candidate;
        expect(rerun.lease.fencingToken).toBe(2);
        expect(
            (
                await runtimeJsonRequest(
                    restarted.server,
                    "POST",
                    "/api/integrations/verification-jobs/result",
                    { expectedRevision: running.revision, result: oldResult },
                    oldCapability,
                )
            ).status,
        ).toBe(401);

        const result = await runtimeJobResult(queued.candidateId, candidate, rerun.lease);
        const digest = (await identifyCandidateAdmissionJobResult(result)).digest;
        const capability = await seal(restarted.server, rerun, digest);
        clock.value = "2026-07-26T10:06:00.000Z";
        const resultBody = { expectedRevision: rerun.revision, result };
        const completed = await runtimeJsonRequest(
            restarted.server,
            "POST",
            "/api/integrations/verification-jobs/result",
            resultBody,
            capability,
        );
        expect(completed.status).toBe(200);
        expect((await completed.json()).candidate.status).toBe("passed");
        expect(
            (
                await runtimeJsonRequest(
                    restarted.server,
                    "POST",
                    "/api/integrations/verification-jobs/result",
                    resultBody,
                    capability,
                )
            ).status,
        ).toBe(200);
    });
});

async function startProtocol(
    root: string,
    clock: { value: string },
    candidate: Awaited<ReturnType<typeof runtimeCandidateValue>>,
) {
    const protocol = await createProductionRepositoryCandidateProtocol({
        root,
        now: () => clock.value,
        capabilitySigningKey: "c".repeat(64),
        leaseDurationMs: 120_000,
        async plan({ candidateId }) {
            return await runtimeAdmissionPlan(candidateId, candidate);
        },
    });
    const runner = new BunRunner();
    let authenticatedWorker!: Runner;
    let capabilityWorker!: Runner;
    runner.group(BASE, protocol.mountManagement, [guard("management-secret", false)]);
    runner.group(
        BASE,
        (scoped) => {
            authenticatedWorker = scoped;
        },
        [guard("worker-secret", true)],
    );
    runner.group(BASE, (scoped) => {
        capabilityWorker = scoped;
    });
    protocol.mountWorkerAuthenticated(authenticatedWorker);
    protocol.mountWorkerCapabilities(capabilityWorker);
    const server = serveForTest(runner);
    servers.push(server);
    return { server, recoveredLeases: protocol.recovery.recoveredLeases };
}

async function seal(server: TestServer, running: any, resultDigest: string): Promise<string> {
    const response = await runtimeJsonRequest(
        server,
        "POST",
        "/api/integrations/verification-jobs/result-capabilities",
        {
            candidateId: running.candidateId,
            jobId: running.lease.jobId,
            attemptId: running.lease.attemptId,
            fencingToken: running.lease.fencingToken,
            workerId: running.lease.workerId,
            resultDigest,
        },
        "worker-secret",
    );
    expect(response.status).toBe(201);
    return (await response.json()).capability.token;
}

function guard(token: string, worker: boolean) {
    const config = {
        serviceToken: token,
        servicePrincipal: worker ? "worker" : "management",
        rateLimiter: new InMemoryRateLimiter({ limit: 100, windowSeconds: 60 }),
    };
    return worker ? createRepositoryWorkerGuard(config) : createRepositoryManagementGuard(config);
}
