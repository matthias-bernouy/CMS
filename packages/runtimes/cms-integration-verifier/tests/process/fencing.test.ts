import { describe, expect, test } from "bun:test";
import { createVerificationSupervisor } from "../../src";
import { createFakeWorkerClient, pausedScheduler } from "../fixtures/fakeWorker";
import { processSandboxFixture } from "./support";

describe("process sandbox fencing", () => {
    test("rejects a stale attempt result before capability sealing or replayable submission", async () => {
        const fixture = await processSandboxFixture("stale-fence");
        const worker = await createFakeWorkerClient();
        try {
            const supervisor = createVerificationSupervisor({
                client: worker.client,
                sandbox: fixture.sandbox,
                scheduler: pausedScheduler(),
                jobListLimit: 1,
                leaseRenewalIntervalMs: 30_000,
                databases: {
                    async acquire() {
                        return {
                            credential: {
                                databaseId: "database-1",
                                connectionUri:
                                    "postgresql://ephemeral:database-secret@postgres:5432/cmscore_contracts_1",
                            },
                            async release() {},
                        };
                    },
                },
            });

            await expect(supervisor.runNext()).rejects.toMatchObject({
                code: "sandbox-result-invalid",
                retryable: false,
            });
            expect(worker.calls).not.toContain("seal");
            expect(worker.calls).not.toContain("submit");
        } finally {
            await fixture.cleanup();
        }
    });
});
