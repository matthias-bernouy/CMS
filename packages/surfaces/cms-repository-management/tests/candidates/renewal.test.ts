import { afterEach, describe, expect, test } from "bun:test";
import { candidateProtocolFixture, requestJson, submitAndQueue, TIMES, type CandidateProtocolFixture } from "./support";

let fixture: CandidateProtocolFixture | undefined;

afterEach(() => {
    fixture?.cleanup();
    fixture = undefined;
});

describe("candidate worker lease renewal", () => {
    test("bounds a new lease by the immutable candidate TTL", async () => {
        fixture = await candidateProtocolFixture();
        const queued = await submitAndQueue(fixture);
        fixture.clock.value = "2026-07-27T09:59:00.000Z";

        const claim = await requestJson(
            fixture.server,
            "POST",
            "/api/integrations/verification-jobs/claims",
            { candidateId: queued.candidateId, expectedRevision: queued.revision, workerId: "worker-1" },
            "worker-secret",
        );

        expect(claim.status).toBe(201);
        expect((await claim.json()).candidate.lease.leaseExpiresAt).toBe("2026-07-27T10:00:00.000Z");
    });

    test("extends from server time without allowing early duration accumulation", async () => {
        fixture = await candidateProtocolFixture();
        const queued = await submitAndQueue(fixture);
        fixture.clock.value = TIMES.claimed;
        const claim = await requestJson(
            fixture.server,
            "POST",
            "/api/integrations/verification-jobs/claims",
            { candidateId: queued.candidateId, expectedRevision: queued.revision, workerId: "worker-1" },
            "worker-secret",
        );
        const running = (await claim.json()).candidate;
        const renewal = {
            candidateId: running.candidateId,
            expectedRevision: running.revision,
            jobId: running.lease.jobId,
            attemptId: running.lease.attemptId,
            fencingToken: running.lease.fencingToken,
            workerId: running.lease.workerId,
        };

        const tooEarly = await requestJson(
            fixture.server,
            "POST",
            "/api/integrations/verification-jobs/lease",
            renewal,
            "worker-secret",
        );
        expect(tooEarly.status).toBe(422);

        fixture.clock.value = TIMES.completed;
        const renewed = await requestJson(
            fixture.server,
            "POST",
            "/api/integrations/verification-jobs/lease",
            renewal,
            "worker-secret",
        );
        expect(renewed.status).toBe(200);
        expect((await renewed.json()).candidate.lease.leaseExpiresAt).toBe("2026-07-26T10:06:00.000Z");
    });
});
