import { describe, expect, test } from "bun:test";
import {
    ambiguousMigrationReconciliationRetryConfirmation,
    retryAmbiguousMigrationReconciliation,
    runIntegrationInstallation,
    type IntegrationBlocImportContext,
    type IntegrationDefinition,
    type IntegrationInstallation,
    type IntegrationInstallationRepository,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository, sourceDtoToSource, type Source } from "@bernouy/cms-sources";
import { MIGRATION_DIGEST, MIGRATION_PHASES, migrationFixture } from "../fakeRuntimeFixture";
import { fakeMigrationTargetWithSource } from "../fakeRuntimeDefinition";

describe("durable migration declarative reconciliation", () => {
    test("fails closed without replay when the reconciliation receipt is ambiguous", async () => {
        const fixture = await migrationFixture();
        const target = targetDefinition(fixture.target);
        const sources = new TrackingSourceRepository();
        const sourceArtifact = target.artifacts?.find((artifact) => artifact.type === "source");
        if (!sourceArtifact || sourceArtifact.type !== "source") {
            throw new Error("missing target Source fixture");
        }
        await sources.createSource(
            sourceDtoToSource({ ...sourceArtifact.source, id: "commerce-api", identityAuthority: target.kind }),
        );
        const installed = await fixture.installations.get("commerce");
        if (!installed) {
            throw new Error("missing integration fixture");
        }
        await fixture.installations.replace({
            ...installed,
            definitionSnapshot: {
                ...installed.definitionSnapshot!,
                afterInstallation: target.afterInstallation,
            },
            answersSnapshot: { id: "commerce-api" },
            artifacts: [
                { type: "source", id: "urn:commerce-api", action: "created" },
                { type: "bloc", id: "commerce-summary", action: "created" },
            ],
        });

        const hookCalls: string[] = [];
        const blocImports: Array<{ viewJS: string; context: IntegrationBlocImportContext }> = [];
        const deps = {
            sources,
            secrets: new InMemorySecretStore(),
            migrationRuntime: fixture.runtime,
            migrationClock: fixture.clock,
            sourceExecutorDeps: {
                fetchImpl: async (input: string | URL | Request) => {
                    hookCalls.push(new Request(input).url);
                    return Response.json({ ok: true });
                },
            },
            blocs: {
                importBloc: async (
                    artifact: { tag: string; viewJS: string },
                    _options: unknown,
                    context: IntegrationBlocImportContext,
                ) => {
                    blocImports.push({ viewJS: artifact.viewJS, context });
                    return { id: artifact.tag, action: "updated" as const };
                },
            },
        };
        const installations = new CrashBeforeReceiptRepository(fixture.installations);

        const upgrade = () =>
            runIntegrationInstallation({
                mode: "upgrade" as const,
                deps,
                installations,
                integrationId: "commerce",
                targetDefinition: target,
                packageResolver: {
                    resolve: async () => ({
                        root: "/tmp/cms-migration-target",
                        kind: "commerce",
                        version: "1.1.0",
                        digest: MIGRATION_DIGEST,
                        definition: target,
                    }),
                },
            });

        await expect(upgrade()).rejects.toThrow(/simulated receipt crash/);
        expect((await fixture.installations.get("commerce"))?.migrationOperation?.status).toBe("paused");
        await expect(upgrade()).rejects.toThrow(/outcome is ambiguous; operator recovery is required/);

        expect(hookCalls).toEqual([]);
        expect(blocImports).toEqual([
            {
                viewJS: "export const release = '1.1.0';",
                context: {
                    integrationKind: "commerce",
                    installationId: "commerce",
                    definitionVersion: "1.1.0",
                },
            },
        ]);
        expect(MIGRATION_PHASES.map((phase) => fixture.runtime.executions.get(phase))).toEqual(
            MIGRATION_PHASES.map(() => 1),
        );
        expect(sources.updateCount).toBe(0);
        expect(
            (await fixture.installations.get("commerce"))?.migrationOperation?.journal.find(
                (entry) => entry.phase === "reconcile-declarative",
            )?.status,
        ).toBe("failed");

        const ambiguous = await fixture.installations.get("commerce");
        const operation = ambiguous?.migrationOperation;
        if (!operation) {
            throw new Error("missing ambiguous migration operation");
        }
        const authorized = await retryAmbiguousMigrationReconciliation({
            installations,
            installationId: "commerce",
            expectedOperationId: operation.id,
            expectedRevision: operation.revision,
            actor: "repository-admin",
            reason: "Verified target state; explicitly accept a potentially repeated reconciliation.",
            confirmation: ambiguousMigrationReconciliationRetryConfirmation(operation.id),
            clock: fixture.clock,
        });
        expect(authorized.migrationOperation?.reconciliationResolutions).toEqual([
            expect.objectContaining({
                action: "retry",
                actor: "repository-admin",
                previousAttemptId: operation.journal.find((entry) => entry.phase === "reconcile-declarative")
                    ?.attemptId,
                previousStatus: "failed",
            }),
        ]);

        const upgraded = await upgrade();
        expect(upgraded.installation.migrationOperation?.status).toBe("completed");
        expect(hookCalls).toHaveLength(0);
        expect(blocImports).toHaveLength(2);
    });
});

class TrackingSourceRepository extends InMemorySourceRepository {
    updateCount = 0;

    override async updateSource(source: Source): Promise<Source | null> {
        this.updateCount += 1;
        return await super.updateSource(source);
    }
}

class CrashBeforeReceiptRepository implements IntegrationInstallationRepository {
    private crashed = false;

    constructor(private readonly delegate: IntegrationInstallationRepository) {}

    list() {
        return this.delegate.list();
    }

    get(id: string) {
        return this.delegate.get(id);
    }

    create(input: Parameters<IntegrationInstallationRepository["create"]>[0]) {
        return this.delegate.create(input);
    }

    replace(installation: IntegrationInstallation) {
        return this.delegate.replace(installation);
    }

    async compareAndSwapMigration(expected: IntegrationInstallation, next: IntegrationInstallation) {
        const expectedReconciliation = expected.migrationOperation?.journal.find(
            (entry) => entry.phase === "reconcile-declarative",
        );
        const nextReconciliation = next.migrationOperation?.journal.find(
            (entry) => entry.phase === "reconcile-declarative",
        );
        if (
            !this.crashed &&
            expectedReconciliation?.status === "running" &&
            nextReconciliation?.status === "succeeded"
        ) {
            this.crashed = true;
            throw new Error("simulated receipt crash");
        }
        return await this.delegate.compareAndSwapMigration!(expected, next);
    }
}

function targetDefinition(base: IntegrationDefinition): IntegrationDefinition {
    const withSource = fakeMigrationTargetWithSource({ targetUrl: "https://connector.example/setup" });
    return {
        ...base,
        inputs: withSource.inputs,
        afterInstallation: [
            {
                id: "prepare-storage",
                steps: [{ id: "setup", call: { source: "{{answers.id}}", endpoint: "setup" } }],
            },
        ],
        artifacts: [
            ...(withSource.artifacts ?? []),
            {
                type: "bloc",
                bloc: {
                    tag: "commerce-summary",
                    name: "Commerce summary",
                    viewJS: "export const release = '1.1.0';",
                },
            },
        ],
    };
}
