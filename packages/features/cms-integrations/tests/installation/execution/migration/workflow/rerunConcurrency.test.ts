import { describe, expect, test } from "bun:test";
import {
    abandonPendingIntegrationOperation,
    legacyPendingIntegrationOperationAbandonmentConfirmation,
    runIntegrationInstallation,
    type IntegrationInstallation,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { fakeMigrationTargetWithSource } from "../fakeRuntimeDefinition";
import { migrationFixture, runMigrationFixture } from "../fakeRuntimeFixture";

describe("rerun and migration fencing", () => {
    test("does not let a stale rerun erase a migration claimed while package resolution was blocked", async () => {
        const fixture = await migrationFixture();
        const resolverGate = deferred();
        const resolverEntered = deferred();
        const migrationGate = deferred();
        const migrationEntered = deferred();
        const rerun = rerunFixture(fixture, async () => {
            resolverEntered.resolve();
            await resolverGate.promise;
        });
        await resolverEntered.promise;
        fixture.runtime.afterExecute = async (context) => {
            if (context.phase === "expand") {
                migrationEntered.resolve();
                await migrationGate.promise;
            }
        };
        const migration = runMigrationFixture(fixture);
        await migrationEntered.promise;
        const owner = (await fixture.installations.get("commerce"))?.migrationOperation;

        resolverGate.resolve();
        await expect(rerun).rejects.toThrow(/state changed concurrently/);
        expect((await fixture.installations.get("commerce"))?.migrationOperation).toMatchObject({
            id: owner?.id,
            attemptId: owner?.attemptId,
            status: "running",
        });

        migrationGate.resolve();
        expect((await migration).installation.migrationOperation?.status).toBe("completed");
    });

    test("allows only one ordinary operation to claim the same installation revision", async () => {
        const fixture = await migrationFixture();
        const gate = deferred();
        const firstEntered = deferred();
        const secondEntered = deferred();
        let entered = 0;
        const resolve = async () => {
            entered += 1;
            (entered === 1 ? firstEntered : secondEntered).resolve();
            await gate.promise;
        };
        const first = rerunFixture(fixture, resolve);
        const second = rerunFixture(fixture, resolve);
        await Promise.all([firstEntered.promise, secondEntered.promise]);

        gate.resolve();
        const results = await Promise.allSettled([first, second]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
        expect((await fixture.installations.get("commerce"))?.migrationOperation).toBeUndefined();
    });

    test("does not start a migration while an ordinary operation owns pending state", async () => {
        const fixture = await migrationFixture();
        const installation = await fixture.installations.get("commerce");
        if (!installation) {
            throw new Error("missing installation fixture");
        }
        await fixture.installations.replace(withPendingOperation(installation));

        await expect(runMigrationFixture(fixture)).rejects.toThrow(/another operation in progress/);
        expect(fixture.runtime.executions.size).toBe(0);
    });

    test("does not let a later rerun steal pending state from an ordinary operation", async () => {
        const fixture = await migrationFixture();
        const installation = await fixture.installations.get("commerce");
        if (!installation) {
            throw new Error("missing installation fixture");
        }
        await fixture.installations.replace(withPendingOperation(installation));

        await expect(rerunFixture(fixture, async () => undefined)).rejects.toThrow(/another operation in progress/);
    });

    test("keeps pending ownership while an after-installation hook is in flight", async () => {
        const fixture = await migrationFixture();
        const hook = {
            id: "setup",
            steps: [{ id: "call", call: { source: "{{answers.id}}", endpoint: "setup" } }],
        };
        const source = {
            ...fakeMigrationTargetWithSource({ targetUrl: "https://connector.example/v1/setup" }),
            version: "1.0.0",
            connectors: undefined,
            afterInstallation: [hook],
        };
        fixture.target = {
            ...fakeMigrationTargetWithSource({ targetUrl: "https://connector.example/v2/setup" }),
            afterInstallation: [hook],
        };
        const installation = await fixture.installations.get("commerce");
        if (!installation) {
            throw new Error("missing installation fixture");
        }
        await fixture.installations.replace({
            ...installation,
            definitionSnapshot: source,
            answersSnapshot: { id: "commerce-api" },
        });
        const entered = deferred();
        const release = deferred();
        const rerun = runIntegrationInstallation({
            mode: "rerun",
            deps: {
                sources: new InMemorySourceRepository(),
                secrets: new InMemorySecretStore(),
                sourceExecutorDeps: {
                    fetchImpl: async () => {
                        entered.resolve();
                        await release.promise;
                        return Response.json({ ok: true });
                    },
                },
            },
            installations: fixture.installations,
            integrationId: "commerce",
            packageResolver: {
                resolve: async () => ({
                    root: "/tmp/cms-migration-source",
                    kind: "commerce",
                    version: "1.0.0",
                    digest: "e".repeat(64),
                    definition: source,
                }),
            },
        });
        await entered.promise;
        expect((await fixture.installations.get("commerce"))?.status).toBe("pending");

        await expect(runMigrationFixture(fixture)).rejects.toThrow(/another operation in progress/);
        release.resolve();
        expect((await rerun).installation.status).toBe("success");
    });

    test("preserves legacy repository recovery when fenced CAS is unavailable", async () => {
        const fixture = await migrationFixture();
        const installation = await fixture.installations.get("commerce");
        if (!installation) {
            throw new Error("missing installation fixture");
        }
        await fixture.installations.replace({ ...installation, status: "pending" });
        const legacy = {
            list: () => fixture.installations.list(),
            get: (id: string) => fixture.installations.get(id),
            create: (input: Parameters<typeof fixture.installations.create>[0]) => fixture.installations.create(input),
            replace: (next: Parameters<typeof fixture.installations.replace>[0]) => fixture.installations.replace(next),
        };

        const rerun = await runIntegrationInstallation({
            mode: "rerun",
            deps: { sources: new InMemorySourceRepository(), secrets: new InMemorySecretStore() },
            installations: legacy,
            integrationId: "commerce",
            packageResolver: {
                resolve: async () => ({
                    root: "/tmp/cms-migration-source",
                    kind: "commerce",
                    version: "1.0.0",
                    digest: "e".repeat(64),
                    definition: fixture.source,
                }),
            },
        });

        expect(rerun.installation.status).toBe("success");
        expect(rerun.installation.pendingOperation).toBeUndefined();
    });

    test("does not auto-claim a legacy markerless pending document while its old writer may still be alive", async () => {
        const fixture = await migrationFixture();
        const installation = await fixture.installations.get("commerce");
        if (!installation) {
            throw new Error("missing installation fixture");
        }
        const pending = await fixture.installations.replace({
            ...installation,
            status: "pending",
            pendingOperation: undefined,
        });

        await expect(rerunFixture(fixture, async () => undefined)).rejects.toThrow(/operation in progress/);

        const oldWriter = await fixture.installations.replace({ ...pending, status: "success" });
        expect(oldWriter.status).toBe("success");
        expect(oldWriter.runCount).toBe(installation.runCount);
    });

    test("requires explicit owner-stopped abandonment before rerunning a legacy markerless pending document", async () => {
        const fixture = await migrationFixture();
        const installation = await fixture.installations.get("commerce");
        if (!installation) {
            throw new Error("missing installation fixture");
        }
        const pending = await fixture.installations.replace({
            ...installation,
            status: "pending",
            pendingOperation: undefined,
        });
        const abandoned = await abandonPendingIntegrationOperation({
            installations: fixture.installations,
            installationId: installation.id,
            expectedUpdatedAt: pending.updatedAt,
            actor: "admin-subject",
            reason: "The legacy CMS process was confirmed stopped.",
            confirmation: legacyPendingIntegrationOperationAbandonmentConfirmation(installation.id, pending.updatedAt),
        });

        expect(abandoned).toMatchObject({
            status: "failed",
            pendingOperationAbandonments: [
                expect.objectContaining({ legacyMarkerless: true, externalReconciliationRequired: true }),
            ],
        });
        const rerun = await rerunFixture(fixture, async () => undefined);
        expect(rerun.installation.status).toBe("success");
        expect(rerun.installation.runCount).toBe(installation.runCount + 2);
    });

    test("does not misclassify an active migration as a legacy markerless pending operation", async () => {
        const fixture = await migrationFixture();
        const entered = deferred();
        const release = deferred();
        fixture.runtime.afterExecute = async (context) => {
            if (context.phase === "expand") {
                entered.resolve();
                await release.promise;
            }
        };
        const migration = runMigrationFixture(fixture);
        await entered.promise;
        const pending = await fixture.installations.get("commerce");
        if (!pending) {
            throw new Error("missing migration-owned installation fixture");
        }

        await expect(
            abandonPendingIntegrationOperation({
                installations: fixture.installations,
                installationId: pending.id,
                expectedUpdatedAt: pending.updatedAt,
                actor: "admin-subject",
                reason: "This must not bypass migration compensation.",
                confirmation: legacyPendingIntegrationOperationAbandonmentConfirmation(pending.id, pending.updatedAt),
            }),
        ).rejects.toThrow(/unfinished migration/);

        release.resolve();
        expect((await migration).installation.migrationOperation?.status).toBe("completed");
    });
});

function withPendingOperation(installation: IntegrationInstallation): IntegrationInstallation {
    return {
        ...installation,
        status: "pending" as const,
        pendingOperation: {
            id: "active-ordinary-operation",
            startedAt: new Date(),
            sourceState: {
                status: installation.status,
                definitionVersion: installation.definitionVersion,
                definitionSnapshot: installation.definitionSnapshot,
                packageDigest: installation.packageDigest,
                connectorBindings: installation.connectorBindings,
                answersSnapshot: installation.answersSnapshot,
                secretRefs: installation.secretRefs,
                secretInputs: installation.secretInputs,
                artifacts: installation.artifacts,
                runCount: installation.runCount,
                runs: installation.runs,
            },
        },
    };
}

async function rerunFixture(fixture: Awaited<ReturnType<typeof migrationFixture>>, beforeResolve: () => Promise<void>) {
    return await runIntegrationInstallation({
        mode: "rerun",
        deps: { sources: new InMemorySourceRepository(), secrets: new InMemorySecretStore() },
        installations: fixture.installations,
        integrationId: "commerce",
        packageResolver: {
            resolve: async () => {
                await beforeResolve();
                return {
                    root: "/tmp/cms-migration-source",
                    kind: "commerce",
                    version: "1.0.0",
                    digest: "e".repeat(64),
                    definition: fixture.source,
                };
            },
        },
    });
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    return { promise: new Promise<void>((done) => (resolve = done)), resolve: () => resolve() };
}
