import { describe, expect, test } from "bun:test";
import type {
    IntegrationDefinition,
    IntegrationMigrationPhase,
    IntegrationMigrationRuntime,
    IntegrationMigrationStepResult,
} from "@bernouy/cms-integrations";
import postIntegrationInstallationUpgrade from "cms-control/api/_platform/integrations/installations/upgrade.post";
import { makeCms, postUpgrade, recordingPackageResolver } from "../support/helpers";

const TARGET_DIGEST = "d".repeat(64);

describe("Control migration-aware integration upgrade", () => {
    test("injects the composed runtime and completes the durable saga through the public action", async () => {
        const fixture = await migrationControlFixture(true);

        const response = await postIntegrationInstallationUpgrade(
            postUpgrade("commerce", { version: "1.1.0" }),
            fixture.cms,
        );
        const body = (await response.json()) as { installation: { definitionVersion: string } };

        expect(response.status).toBe(200);
        expect(body.installation.definitionVersion).toBe("1.1.0");
        expect(fixture.runtime.executed).toEqual([
            "expand",
            "deploy-functions",
            "smoke-target",
            "provider-direct-transition",
            "switch-cms-binding",
            "smoke-cms",
            "drain",
            "point-of-no-return",
            "contract",
        ]);
        expect((await fixture.installations.get("commerce"))?.migrationOperation?.status).toBe("completed");
    });

    test("refuses to invent connector identity or ledger provenance for a legacy installation", async () => {
        const fixture = await migrationControlFixture(false);

        await expect(
            postIntegrationInstallationUpgrade(postUpgrade("commerce", { version: "1.1.0" }), fixture.cms),
        ).rejects.toThrow(/explicit legacy baseline adoption/);
        expect(fixture.runtime.executed).toEqual([]);
        expect((await fixture.installations.get("commerce"))?.definitionVersion).toBe("1.0.0");
    });

    test("rejects a forged upgrade when the composite release has no exact migration path", async () => {
        const fixture = await migrationControlFixture(true);
        Object.assign(fixture.cms, {
            integrationUpgradeReleases: {
                get: async () => ({
                    kind: "commerce",
                    version: "1.1.0",
                    packageDigest: TARGET_DIGEST,
                    status: "installable",
                    installable: true,
                    freshInstallOnly: true,
                    compatibility: { releaseLevel: "minor" },
                    decision: { admissible: true },
                    migrations: [],
                }),
            },
        });

        await expect(
            postIntegrationInstallationUpgrade(postUpgrade("commerce", { version: "1.1.0" }), fixture.cms),
        ).rejects.toThrow(/fresh-install-only|No passed migration proof/);
        expect(fixture.runtime.executed).toEqual([]);
        expect((await fixture.installations.get("commerce"))?.definitionVersion).toBe("1.0.0");
    });
});

class RecordingMigrationRuntime implements IntegrationMigrationRuntime {
    readonly executed: IntegrationMigrationPhase[] = [];
    private readonly remote = new Map<string, IntegrationMigrationStepResult>();

    async executeStep(context: Parameters<IntegrationMigrationRuntime["executeStep"]>[0]) {
        this.executed.push(context.phase);
        const result = {
            confirmationDigest: context.targetDigest,
            externalOperationId: `remote:${context.idempotencyKey}`,
        };
        this.remote.set(context.idempotencyKey, result);
        return result;
    }

    async confirmStep(context: Parameters<IntegrationMigrationRuntime["confirmStep"]>[0]) {
        const result = this.remote.get(context.idempotencyKey);
        return result ? { confirmed: true, ...result } : { confirmed: false };
    }
}

async function migrationControlFixture(withBinding: boolean) {
    const source: IntegrationDefinition = { kind: "commerce", label: "Commerce", version: "1.0.0", inputs: [] };
    const target = migrationTarget();
    const fixture = makeCms([source, target]);
    await fixture.integrationInstallations.create({
        id: "commerce",
        label: "Commerce",
        definitionVersion: "1.0.0",
        definitionSnapshot: source,
        packageDigest: "c".repeat(64),
        ...(withBinding
            ? {
                  connectorBindings: {
                      primary: {
                          connectorKey: "primary",
                          provider: "supabase",
                          lineageId: "commerce-supabase-v1",
                          connectorInstanceId: "connector-instance-1",
                          migrationRevision: 1,
                          outputs: { functionsBaseUrl: "https://project.supabase.co/functions/v1" },
                      },
                  },
                  connectorBaselineAdoptions: [
                      {
                          id: "1".repeat(64),
                          actor: "fixture-admin",
                          adoptedAt: new Date("2026-07-26T09:00:00.000Z"),
                          sourceDefinitionVersion: "1.0.0",
                          sourcePackageDigest: "c".repeat(64),
                          targetDefinitionVersion: "1.1.0",
                          targetPackageDigest: TARGET_DIGEST,
                          connectorKey: "primary",
                          provider: "supabase",
                          lineageId: "commerce-supabase-v1",
                          connectorInstanceId: "connector-instance-1",
                          migrationRevision: 1,
                          baselineDigest: "2".repeat(64),
                          externalOperationId: "fixture-adoption",
                      },
                  ],
              }
            : {}),
        status: "success",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
    });
    const runtime = new RecordingMigrationRuntime();
    const { resolver } = recordingPackageResolver(() => target);
    const resolved = resolver.resolve;
    resolver.resolve = async (request) => ({ ...(await resolved(request)), digest: TARGET_DIGEST });
    Object.assign(fixture.cms, {
        integrationMigrationRuntime: runtime,
        integrationPackageResolver: resolver,
        integrationUpgradeReleases: {
            get: async () => ({
                kind: "commerce",
                version: "1.1.0",
                packageDigest: TARGET_DIGEST,
                status: "installable",
                installable: true,
                freshInstallOnly: false,
                compatibility: { releaseLevel: "minor" },
                decision: { admissible: true },
                migrations: [
                    {
                        reportId: "migration-1",
                        reportDigest: "1".repeat(64),
                        source: { kind: "commerce", version: "1.0.0", packageDigest: "c".repeat(64) },
                        supportedSourceRange: "^1.0.0",
                        connectorKey: "primary",
                        lineageId: "commerce-supabase-v1",
                        migrationRevision: 2,
                        outcome: "passed",
                        runner: { name: "cms-postgres", version: "1.0.0", imageDigest: "sha256:pinned" },
                        environmentDigest: "2".repeat(64),
                        cutover: { cmsMediated: "binding-revision", providerDirect: "expand-in-code" },
                        rollback: "available",
                        pointOfNoReturn: "cleanup",
                        delayedCleanupVerified: true,
                    },
                ],
            }),
        },
    });
    return { cms: fixture.cms, installations: fixture.integrationInstallations, runtime };
}

function migrationTarget(): IntegrationDefinition {
    const checksum = `sha256:${"e".repeat(64)}` as const;
    return {
        kind: "commerce",
        label: "Commerce",
        version: "1.1.0",
        inputs: [],
        connectors: [
            {
                provider: "supabase",
                connectorKey: "primary",
                lineageId: "commerce-supabase-v1",
                migrationRevision: 2,
                migration: {
                    install: { revision: 2, digest: checksum, coveredMigrations: [] },
                    migrations: [
                        {
                            id: "expand-commerce",
                            checksum,
                            fromRevision: 1,
                            toRevision: 2,
                            introducedIn: "1.1.0",
                            transaction: "atomic",
                            phase: "expand",
                            path: "migrations/0002-expand-commerce.sql",
                        },
                    ],
                    supportedSources: [{ range: "^1.0.0", migrationRevision: 1 }],
                    pointOfNoReturn: "before-contract",
                },
            },
        ],
    };
}
