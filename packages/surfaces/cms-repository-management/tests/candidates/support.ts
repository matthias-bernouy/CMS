import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { FsIntegrationRegistryCandidateStore } from "@bernouy/cms-integration-registry/fs";
import {
    createRepositoryCandidateCapabilityAuthority,
    createRepositoryCandidateAdmissionCoordinator,
    createRepositoryManagementGuard,
    createRepositoryWorkerGuard,
    mountRepositoryCandidateManagementRoutes,
    mountRepositoryCandidateWorkerRoutes,
    RepositoryCandidateAdmissionPlanningError,
    type RepositoryCandidatePublicationFinalizer,
} from "@bernouy/cms-repository-management";
import { BunRunner, type Runner } from "@bernouy/http-runner";
import { serveForTest, type TestServer } from "@bernouy/http-runner/testing";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { candidateAdmission, candidatePolicy, candidateValue } from "./values";

export { candidateJobResult } from "./values";

export const TIMES = {
    created: "2026-07-26T10:00:00.000Z",
    validating: "2026-07-26T10:01:00.000Z",
    queued: "2026-07-26T10:02:00.000Z",
    claimed: "2026-07-26T10:03:00.000Z",
    completed: "2026-07-26T10:04:00.000Z",
} as const;

export type CandidateProtocolFixture = Awaited<ReturnType<typeof candidateProtocolFixture>>;

export async function candidateProtocolFixture(
    planningFailure = false,
    publication?: RepositoryCandidatePublicationFinalizer,
) {
    const root = mkdtempSync(join(tmpdir(), "cms-candidate-protocol-"));
    const store = new FsIntegrationRegistryCandidateStore({ root });
    const candidate = await candidateValue();
    const clock: { value: string } = { value: TIMES.created };
    const runner = new BunRunner();
    const managementGuard = createRepositoryManagementGuard({
        serviceToken: "management-secret",
        servicePrincipal: "management-cms",
        rateLimiter: new InMemoryRateLimiter({ limit: 100, windowSeconds: 60 }),
    });
    const workerGuard = createRepositoryWorkerGuard({
        serviceToken: "worker-secret",
        servicePrincipal: "verifier-supervisor",
        rateLimiter: new InMemoryRateLimiter({ limit: 100, windowSeconds: 60 }),
    });
    const config = {
        store,
        capabilityAuthority: createRepositoryCandidateCapabilityAuthority({ signingKey: "k".repeat(64) }),
        maxBodyBytes: 1_024 * 1_024,
        maxResultBodyBytes: 1_024 * 1_024,
        leaseDurationMs: 120_000,
        now: () => clock.value,
        createJobId: () => "job-1",
        createAttemptId: () => `attempt-${clock.value === TIMES.claimed ? "1" : "2"}`,
        ...(publication ? { publication } : {}),
    };
    const admission = createRepositoryCandidateAdmissionCoordinator({
        store,
        now: config.now,
        async plan(input) {
            if (planningFailure) {
                throw new RepositoryCandidateAdmissionPlanningError("admission_policy_unavailable");
            }
            const policy = await candidatePolicy();
            return {
                policy,
                admission: await candidateAdmission(input.candidateId, input.candidate, policy),
            };
        },
    });
    let authenticatedWorker!: Runner;
    let capabilityWorker!: Runner;
    runner.group(
        "/.cms/repository-management",
        (scoped) => {
            mountRepositoryCandidateManagementRoutes(scoped, {
                store,
                admission,
                maxBodyBytes: config.maxBodyBytes,
                candidateTtlMs: 86_400_000,
                now: config.now,
                createCandidateId: () => "candidate-1",
            });
        },
        [managementGuard],
    );
    runner.group(
        "/.cms/repository-management",
        (scoped) => {
            authenticatedWorker = scoped;
        },
        [workerGuard],
    );
    runner.group("/.cms/repository-management", (scoped) => {
        capabilityWorker = scoped;
    });
    mountRepositoryCandidateWorkerRoutes(authenticatedWorker, capabilityWorker, config);
    const server = serveForTest(runner);
    return {
        root,
        store,
        server,
        candidate,
        clock,
        cleanup() {
            server.stop();
            rmSync(root, { recursive: true, force: true });
        },
    };
}

export async function submitAndQueue(fixture: CandidateProtocolFixture) {
    const submitted = await requestJson(
        fixture.server,
        "POST",
        "/api/integrations/candidates",
        fixture.candidate.envelope,
        "management-secret",
    );
    if (submitted.status !== 202) {
        throw new Error(`Candidate submission failed with ${submitted.status}`);
    }
    const queued = await fixture.store.get("candidate-1");
    if (!queued || queued.status !== "queued") {
        throw new Error("Submitted candidate was not persisted");
    }
    return queued;
}

export async function requestJson(server: TestServer, method: string, path: string, value: unknown, token: string) {
    const bytes = canonicalJsonBytes(value);
    return await server.request(method, `/.cms/repository-management${path}`, {
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "content-length": String(bytes.byteLength),
        },
        body: bytes,
    });
}
