import { afterEach, describe, expect, test } from "bun:test";
import { identifyVerificationJobResult } from "@bernouy/cms-integration-verification";
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

describe("candidate result publication", () => {
    test("finalizes a passed result before exposing the candidate response", async () => {
        let fixture!: CandidateProtocolFixture;
        let finalizationCalls = 0;
        fixture = await candidateProtocolFixture(false, {
            async finalize(candidateId) {
                finalizationCalls += 1;
                const passed = await fixture.store.get(candidateId);
                if (!passed || passed.status !== "passed") {
                    throw new Error("Expected an exact passed candidate before publication");
                }
                const publishing = await fixture.store.beginPublication(candidateId, {
                    expectedRevision: passed.revision,
                    now: TIMES.completed,
                });
                return await fixture.store.completePublication(candidateId, {
                    expectedRevision: publishing.revision,
                    now: TIMES.completed,
                });
            },
        });
        fixtures.add(fixture);
        const completed = await submitVerificationResult(fixture);

        expect(completed.status).toBe(200);
        expect((await completed.json()).candidate.status).toBe("published");
        expect(finalizationCalls).toBe(1);
    });

    test("maps finalization failures to structured responses without leaking internals", async () => {
        const fixture = await candidateProtocolFixture(false, {
            async finalize() {
                throw Object.assign(new Error("secret registry path /var/lib/private"), { code: "admission_stale" });
            },
        });
        fixtures.add(fixture);

        const response = await submitVerificationResult(fixture);

        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body).toEqual({
            code: "admission_stale",
            error: "Candidate admission inputs changed; submit a new candidate",
        });
        expect(JSON.stringify(body)).not.toContain("/var/lib/private");
    });
});

async function submitVerificationResult(fixture: CandidateProtocolFixture): Promise<Response> {
    const queued = await submitAndQueue(fixture);
    fixture.clock.value = TIMES.claimed;
    const claim = await requestJson(
        fixture.server,
        "POST",
        "/api/integrations/verification-jobs/claims",
        { candidateId: queued.candidateId, expectedRevision: queued.revision, workerId: "worker-1" },
        "worker-secret",
    );
    const claimed = await claim.json();
    const lease = claimed.candidate.lease;
    const result = await candidateJobResult(queued.candidateId, fixture.candidate, {
        jobId: lease.jobId,
        attemptId: lease.attemptId,
        fencingToken: lease.fencingToken,
    });
    const resultDigest = (await identifyVerificationJobResult(result)).digest;
    fixture.clock.value = TIMES.completed;
    const capabilityResponse = await requestJson(
        fixture.server,
        "POST",
        "/api/integrations/verification-jobs/result-capabilities",
        {
            candidateId: queued.candidateId,
            jobId: lease.jobId,
            attemptId: lease.attemptId,
            fencingToken: lease.fencingToken,
            workerId: lease.workerId,
            resultDigest,
        },
        "worker-secret",
    );
    const capability = (await capabilityResponse.json()).capability.token as string;
    return await requestJson(
        fixture.server,
        "POST",
        "/api/integrations/verification-jobs/result",
        { expectedRevision: claimed.candidate.revision, result },
        capability,
    );
}
