import { describe, expect, test } from "bun:test";
import { identifyVerificationJobResult } from "@bernouy/cms-integration-verification";
import { VerificationSupervisorError, createVerificationSupervisor, type VerificationSandboxInput } from "../../src";
import { runnerFixture } from "../fixtures/contracts";
import { validJobResult } from "../fixtures/result";
import { createFakeWorkerClient, pausedScheduler } from "../fixtures/fakeWorker";

const DATABASE_URI = "postgresql://ephemeral:database-secret@postgres:5432/cmscore_contracts_1";

describe("verification supervisor credential boundary", () => {
    test("gives a malicious sandbox only the exact workload and its disposable database credential", async () => {
        const workerToken = "worker-service-token-never-for-sandbox";
        const capabilitySigningKey = "capability-signing-key-never-for-supervisor";
        const fake = await createFakeWorkerClient();
        let inspected = "";
        let frozen = false;
        let releases = 0;
        const supervisor = createVerificationSupervisor({
            client: fake.client,
            scheduler: pausedScheduler(),
            jobListLimit: 1,
            leaseRenewalIntervalMs: 30_000,
            databases: {
                async acquire() {
                    return {
                        credential: { databaseId: "database-1", connectionUri: DATABASE_URI },
                        async release() {
                            releases += 1;
                        },
                    };
                },
            },
            sandbox: {
                identity: runnerFixture(),
                async run(input) {
                    inspected = JSON.stringify(input);
                    frozen = recursivelyFrozen(input);
                    const result = await validJobResult(fake.claimed);
                    return {
                        ...result,
                        results: result.results.map((suite, index) =>
                            index === 0
                                ? {
                                      ...suite,
                                      diagnostics: [
                                          {
                                              code: "malicious-echo",
                                              message: `database=${input.database.connectionUri}; password=database-secret`,
                                              redacted: true,
                                          },
                                      ],
                                  }
                                : suite,
                        ),
                    };
                },
            },
        });

        const outcome = await supervisor.runNext();

        expect(outcome).toMatchObject({ outcome: "submitted", status: "passed" });
        expect(releases).toBe(1);
        expect(frozen).toBe(true);
        expect(Object.keys(JSON.parse(inspected))).toEqual(["workload", "database"]);
        expect(inspected).toContain(DATABASE_URI);
        expect(inspected).not.toContain(workerToken);
        expect(inspected).not.toContain(capabilitySigningKey);
        const submitted = fake.submissions[0]!.result;
        expect(JSON.stringify(submitted)).not.toContain(DATABASE_URI);
        expect(JSON.stringify(submitted)).not.toContain("database-secret");
        expect(submitted.results[0]!.diagnostics[0]!.message).toContain("[REDACTED]");
        expect(outcome.outcome === "submitted" ? outcome.resultDigest : "").toBe(
            (await identifyVerificationJobResult(submitted)).digest,
        );
    });

    test("rejects secret exfiltration outside diagnostics and never submits it", async () => {
        const fake = await createFakeWorkerClient();
        const supervisor = createVerificationSupervisor({
            client: fake.client,
            scheduler: pausedScheduler(),
            jobListLimit: 1,
            leaseRenewalIntervalMs: 30_000,
            databases: disposableDatabase(),
            sandbox: {
                identity: runnerFixture(),
                async run() {
                    const result = await validJobResult(fake.claimed);
                    const versions = [{ name: "postgres", version: "database-secret" }];
                    return { ...result, environment: { ...result.environment, versions } };
                },
            },
        });

        await expect(supervisor.runNext()).rejects.toMatchObject<Partial<VerificationSupervisorError>>({
            code: "sandbox-result-invalid",
        });
        expect(fake.calls).not.toContain("seal");
        expect(fake.calls).not.toContain("submit");
    });

    test("refuses a workload selected for another pinned runner before provisioning a database", async () => {
        const fake = await createFakeWorkerClient();
        let acquired = false;
        const supervisor = createVerificationSupervisor({
            client: fake.client,
            scheduler: pausedScheduler(),
            jobListLimit: 1,
            leaseRenewalIntervalMs: 30_000,
            databases: {
                async acquire() {
                    acquired = true;
                    throw new Error("must not run");
                },
            },
            sandbox: {
                identity: { ...runnerFixture(), imageDigest: `sha256:${"f".repeat(64)}` },
                async run() {
                    throw new Error("must not run");
                },
            },
        });

        await expect(supervisor.runNext()).rejects.toMatchObject({ code: "runner-mismatch", retryable: false });
        expect(acquired).toBe(false);
    });
});

function disposableDatabase() {
    return {
        async acquire() {
            return {
                credential: { databaseId: "database-1", connectionUri: DATABASE_URI },
                async release() {},
            };
        },
    };
}

function recursivelyFrozen(input: VerificationSandboxInput): boolean {
    const visit = (value: unknown): boolean => {
        if (!value || typeof value !== "object") {
            return true;
        }
        return Object.isFrozen(value) && Object.values(value).every(visit);
    };
    return visit(input);
}
