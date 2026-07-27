import { afterEach, describe, expect, test } from "bun:test";
import { identifyCandidateAdmissionJobResult } from "@bernouy/cms-integration-verification";
import {
    candidateJobResult,
    candidateProtocolFixture,
    requestJson,
    submitAndQueue,
    TIMES,
    type CandidateProtocolFixture,
} from "./support";

const fixtures = new Set<CandidateProtocolFixture>();

afterEach(() => {
    for (const fixture of fixtures) {
        fixture.cleanup();
    }
    fixtures.clear();
});

describe("private repository candidate protocol", () => {
    test("keeps management, supervisor, and result capabilities strictly separated", async () => {
        const fixture = await createFixture();
        const candidatePath = "/api/integrations/candidates";
        expect(
            (await requestJson(fixture.server, "POST", candidatePath, fixture.candidate.envelope, "worker-secret"))
                .status,
        ).toBe(401);
        const nonCanonical = JSON.stringify(fixture.candidate.envelope, null, 2);
        expect(
            (
                await fixture.server.request("POST", `/.cms/repository-management${candidatePath}`, {
                    headers: {
                        authorization: "Bearer management-secret",
                        "content-type": "application/json",
                        "content-length": String(Buffer.byteLength(nonCanonical)),
                    },
                    body: nonCanonical,
                })
            ).status,
        ).toBe(400);

        const queued = await submitAndQueue(fixture);
        const jobsPath = "/api/integrations/verification-jobs";
        expect((await fixture.server.request("GET", `/.cms/repository-management${jobsPath}`)).status).toBe(401);
        expect(
            (
                await fixture.server.request("GET", `/.cms/repository-management${jobsPath}`, {
                    headers: { authorization: "Bearer management-secret" },
                })
            ).status,
        ).toBe(401);
        const jobs = await fixture.server.request("GET", `/.cms/repository-management${jobsPath}`, {
            headers: { authorization: "Bearer worker-secret" },
        });
        expect(jobs.status).toBe(200);
        expect((await jobs.json()).candidates).toHaveLength(1);

        fixture.clock.value = TIMES.claimed;
        const claim = await requestJson(
            fixture.server,
            "POST",
            `${jobsPath}/claims`,
            { candidateId: queued.candidateId, expectedRevision: queued.revision, workerId: "worker-1" },
            "worker-secret",
        );
        expect(claim.status).toBe(201);
        const claimed = await claim.json();
        expect(claimed).not.toHaveProperty("capability");
        expect(claimed.workload).toHaveProperty("admission");

        const lease = claimed.candidate.lease;
        const result = await candidateJobResult(queued.candidateId, fixture.candidate, {
            jobId: lease.jobId,
            attemptId: lease.attemptId,
            fencingToken: lease.fencingToken,
        });
        const resultDigest = (await identifyCandidateAdmissionJobResult(result)).digest;
        fixture.clock.value = TIMES.completed;
        const sealBody = {
            candidateId: queued.candidateId,
            jobId: lease.jobId,
            attemptId: lease.attemptId,
            fencingToken: lease.fencingToken,
            workerId: lease.workerId,
            resultDigest,
        };
        expect(
            (
                await requestJson(
                    fixture.server,
                    "POST",
                    `${jobsPath}/result-capabilities`,
                    sealBody,
                    "management-secret",
                )
            ).status,
        ).toBe(401);
        const sealed = await requestJson(
            fixture.server,
            "POST",
            `${jobsPath}/result-capabilities`,
            sealBody,
            "worker-secret",
        );
        expect(sealed.status).toBe(201);
        const capability = (await sealed.json()).capability.token as string;

        const resultPath = `${jobsPath}/result`;
        const resultBody = { expectedRevision: claimed.candidate.revision, result };
        expect((await requestJson(fixture.server, "POST", resultPath, resultBody, "worker-secret")).status).toBe(401);
        const substituted = {
            ...result,
            verification: {
                ...result.verification,
                results: result.verification.results.map((entry) => ({
                    ...entry,
                    evidenceDigests: ["9".repeat(64)],
                })),
            },
        };
        expect(
            (
                await requestJson(
                    fixture.server,
                    "POST",
                    resultPath,
                    { expectedRevision: claimed.candidate.revision, result: substituted },
                    capability,
                )
            ).status,
        ).toBe(409);

        const completed = await requestJson(fixture.server, "POST", resultPath, resultBody, capability);
        expect(completed.status).toBe(200);
        expect((await completed.json()).candidate.status).toBe("passed");
        expect((await requestJson(fixture.server, "POST", resultPath, resultBody, capability)).status).toBe(200);
    });

    test("authenticates a result capability before reading an untrusted body", async () => {
        const fixture = await createFixture();
        const response = await fixture.server.request(
            "POST",
            "/.cms/repository-management/api/integrations/verification-jobs/result",
            {
                headers: { authorization: "Bearer invalid", "content-type": "application/json" },
                body: "not-json",
            },
        );
        expect(response.status).toBe(401);
        expect((await response.json()).code).toBe("worker_capability_unauthorized");
    });

    test("never leaves a valid submission perpetually uploaded when admission planning fails", async () => {
        const fixture = await candidateProtocolFixture(true);
        fixtures.add(fixture);
        const submitted = await requestJson(
            fixture.server,
            "POST",
            "/api/integrations/candidates",
            fixture.candidate.envelope,
            "management-secret",
        );

        expect(submitted.status).toBe(202);
        const candidate = (await submitted.json()).candidate;
        expect(candidate.status).toBe("rejected");
        expect(candidate.lastFailure).toEqual({
            kind: "validation",
            code: "admission_policy_unavailable",
            occurredAt: TIMES.created,
        });
        expect(candidate.lastFailure).not.toHaveProperty("message");
        expect(await fixture.store.listClaimable(TIMES.claimed)).toEqual([]);
    });
});

async function createFixture() {
    const fixture = await candidateProtocolFixture();
    fixtures.add(fixture);
    return fixture;
}
