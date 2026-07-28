import { describe, expect, test } from "bun:test";
import { VerificationProtocolError, createVerificationSupervisor, type VerificationRenewalScheduler } from "../../src";
import { runnerFixture } from "../fixtures/contracts";
import { validJobResult } from "../fixtures/result";
import { createFakeWorkerClient, pausedScheduler, renewedCandidate } from "../fixtures/fakeWorker";

describe("verification lease coordinator", () => {
    test("renews the exact fenced attempt and seals against the latest revision", async () => {
        let sealedRevision = 0;
        let finishRenewal: (() => void) | undefined;
        const fake = await createFakeWorkerClient({
            async renew(candidate) {
                return await new Promise((resolve) => {
                    finishRenewal = () => resolve(renewedCandidate(candidate));
                });
            },
            async seal(candidate, resultDigest) {
                sealedRevision = candidate.revision;
                return {
                    token: "exact-capability",
                    expiresAt: candidate.lease.leaseExpiresAt,
                    resultDigest,
                };
            },
        });
        const supervisor = createVerificationSupervisor({
            client: fake.client,
            scheduler: oneRenewalScheduler(),
            jobListLimit: 1,
            leaseRenewalIntervalMs: 10,
            databases: disposableDatabase(),
            sandbox: {
                identity: runnerFixture(),
                async run() {
                    while (!fake.calls.includes("renew")) {
                        await Promise.resolve();
                    }
                    const result = await validJobResult(fake.claimed);
                    setTimeout(() => finishRenewal?.(), 0);
                    return result;
                },
            },
        });

        await expect(supervisor.runNext()).resolves.toMatchObject({ outcome: "submitted", status: "passed" });
        expect(fake.calls.filter((call) => call === "renew")).toHaveLength(1);
        expect(sealedRevision).toBe(fake.claimed.candidate.revision + 1);
    });

    test("aborts the sandbox and refuses sealing when renewal substitutes a fencing identity", async () => {
        let observedAbort = false;
        const fake = await createFakeWorkerClient({
            async renew(candidate) {
                const renewed = renewedCandidate(candidate);
                return {
                    ...renewed,
                    lease: { ...renewed.lease, fencingToken: renewed.lease.fencingToken + 1 },
                };
            },
        });
        const supervisor = createVerificationSupervisor({
            client: fake.client,
            scheduler: oneRenewalScheduler(),
            jobListLimit: 1,
            leaseRenewalIntervalMs: 10,
            databases: disposableDatabase(),
            sandbox: {
                identity: runnerFixture(),
                async run(_input, signal) {
                    await new Promise<void>((resolve) => {
                        signal.addEventListener(
                            "abort",
                            () => {
                                observedAbort = true;
                                resolve();
                            },
                            { once: true },
                        );
                    });
                    return await validJobResult(fake.claimed);
                },
            },
        });

        await expect(supervisor.runNext()).rejects.toMatchObject({ code: "lease-lost", retryable: true });
        expect(observedAbort).toBe(true);
        expect(fake.calls).not.toContain("seal");
    });

    test("rejects capability substitution and treats uncertain result transport as retryable without a second submit", async () => {
        const substituted = await createFakeWorkerClient({
            async seal(candidate) {
                return {
                    token: "substituted",
                    expiresAt: candidate.lease.leaseExpiresAt,
                    resultDigest: "f".repeat(64),
                };
            },
        });
        const first = supervisorFor(substituted);
        await expect(first.runNext()).rejects.toMatchObject({ code: "capability-invalid" });
        expect(substituted.calls).not.toContain("submit");

        const failedTransport = await createFakeWorkerClient({
            async submit() {
                throw new VerificationProtocolError("transport", "Repository worker transport failed", true);
            },
        });
        const second = supervisorFor(failedTransport);
        await expect(second.runNext()).rejects.toMatchObject({ kind: "transport", retryable: true });
        expect(failedTransport.calls.filter((call) => call === "submit")).toHaveLength(1);
    });
});

function supervisorFor(fake: Awaited<ReturnType<typeof createFakeWorkerClient>>) {
    return createVerificationSupervisor({
        client: fake.client,
        scheduler: pausedScheduler(),
        jobListLimit: 1,
        leaseRenewalIntervalMs: 30_000,
        databases: disposableDatabase(),
        sandbox: { identity: runnerFixture(), run: async () => await validJobResult(fake.claimed) },
    });
}

function disposableDatabase() {
    return {
        async probe(signal: AbortSignal) {
            signal.throwIfAborted();
        },
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

function oneRenewalScheduler(): VerificationRenewalScheduler {
    let sleeps = 0;
    return {
        now: () => Date.parse("2026-07-26T12:00:00.000Z"),
        async sleep(_duration, signal) {
            sleeps += 1;
            if (sleeps === 1) {
                await Promise.resolve();
                return;
            }
            await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
        },
    };
}
