import { describe, expect, test } from "bun:test";
import {
    createVerificationSupervisor,
    runVerificationPullLoop,
    type DisposableVerificationDatabaseProvider,
    VerificationRuntimeHealth,
} from "../../src";
import { runnerFixture } from "../fixtures/contracts";
import { validJobResult } from "../fixtures/result";
import { createFakeWorkerClient, pausedScheduler } from "../fixtures/fakeWorker";

describe("verification database readiness", () => {
    test("probes before listing and again before acquiring a claimed job", async () => {
        const unavailableBeforeList = await createFakeWorkerClient();
        const first = supervisorFor(unavailableBeforeList, unavailableProvider());

        await expect(first.runNext()).rejects.toMatchObject({ code: "database-unavailable", retryable: true });
        expect(unavailableBeforeList.calls).toEqual([]);

        const unavailableAfterClaim = await createFakeWorkerClient();
        let probes = 0;
        let acquired = false;
        const second = supervisorFor(unavailableAfterClaim, {
            async probe() {
                probes += 1;
                if (probes === 2) {
                    throw new Error("cluster became unavailable");
                }
            },
            async acquire() {
                acquired = true;
                throw new Error("must not acquire");
            },
        });

        await expect(second.runNext()).rejects.toMatchObject({ code: "database-unavailable", retryable: true });
        expect(unavailableAfterClaim.calls).toEqual(["list", "claim"]);
        expect(acquired).toBe(false);
    });

    test("degrades runtime health before an idle worker can list jobs", async () => {
        const fake = await createFakeWorkerClient();
        const supervisor = supervisorFor(fake, unavailableProvider());
        const health = new VerificationRuntimeHealth(() => "2026-07-27T12:00:00.000Z");
        const controller = new AbortController();

        await runVerificationPullLoop({
            supervisor,
            signal: controller.signal,
            pollIntervalMs: 25,
            errorBackoffMs: 50,
            onSuccess: () => health.success(),
            onDiagnostic: (diagnostic) => health.failure(diagnostic),
            async sleep() {
                controller.abort();
            },
        });

        expect(fake.calls).toEqual([]);
        expect(health.snapshot()).toMatchObject({
            ready: false,
            state: "degraded",
            consecutiveFailures: 1,
            lastFailure: { code: "supervisor-database-unavailable", retryable: true },
        });
    });
});

function supervisorFor(
    fake: Awaited<ReturnType<typeof createFakeWorkerClient>>,
    databases: DisposableVerificationDatabaseProvider,
) {
    return createVerificationSupervisor({
        client: fake.client,
        scheduler: pausedScheduler(),
        jobListLimit: 1,
        leaseRenewalIntervalMs: 30_000,
        databases,
        sandbox: { identity: runnerFixture(), run: async () => await validJobResult(fake.claimed) },
    });
}

function unavailableProvider(): DisposableVerificationDatabaseProvider {
    return {
        async probe() {
            throw new Error("cluster unavailable");
        },
        async acquire() {
            throw new Error("must not acquire");
        },
    };
}
