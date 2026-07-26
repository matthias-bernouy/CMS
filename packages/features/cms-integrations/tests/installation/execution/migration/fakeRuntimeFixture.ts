import {
    InMemoryIntegrationInstallationRepository,
    runDurableMigrationUpgrade,
    runIntegrationInstallation,
    type IntegrationDefinition,
    type IntegrationMigrationPhase,
    type IntegrationMigrationRuntime,
    type IntegrationMigrationStepContext,
    type IntegrationMigrationStepResult,
} from "@bernouy/cms-integrations";
import { fakeMigrationTargetDefinition } from "./fakeRuntimeDefinition";

export const MIGRATION_DIGEST = "f".repeat(64);
export const MIGRATION_PHASES: IntegrationMigrationPhase[] = [
    "expand",
    "deploy-functions",
    "smoke-target",
    "provider-direct-transition",
    "switch-cms-binding",
    "smoke-cms",
    "drain",
    "point-of-no-return",
    "contract",
];

class FakeMigrationRuntime implements IntegrationMigrationRuntime {
    readonly remote = new Map<string, IntegrationMigrationStepResult>();
    readonly executions = new Map<IntegrationMigrationPhase, number>();
    readonly connectorInstanceIds = new Set<string>();
    failAfterRemote?: IntegrationMigrationPhase;
    afterExecute?: (context: IntegrationMigrationStepContext) => void | Promise<void>;
    beforeConfirm?: (context: IntegrationMigrationStepContext) => void | Promise<void>;

    async executeStep(context: IntegrationMigrationStepContext): Promise<IntegrationMigrationStepResult> {
        this.rememberConnectorIdentities(context);
        this.executions.set(context.phase, (this.executions.get(context.phase) ?? 0) + 1);
        const result: IntegrationMigrationStepResult = {
            confirmationDigest: context.targetDigest,
            externalOperationId: `external:${context.idempotencyKey}`,
            ...(context.phase === "switch-cms-binding"
                ? {
                      importResult: {
                          artifacts: [{ type: "source", id: "commerce-api", action: "updated" }],
                          connectors: [
                              {
                                  provider: "supabase",
                                  connectorKey: "primary",
                                  outputs: { functionsBaseUrl: "https://target.example/functions/v1" },
                              },
                          ],
                      },
                  }
                : {}),
        };
        this.remote.set(context.idempotencyKey, result);
        await this.afterExecute?.(context);
        if (this.failAfterRemote === context.phase) {
            throw new Error(`injected ${context.phase}`);
        }
        return result;
    }

    async confirmStep(context: IntegrationMigrationStepContext) {
        this.rememberConnectorIdentities(context);
        await this.beforeConfirm?.(context);
        const result = this.remote.get(context.idempotencyKey);
        return result ? { confirmed: true, ...result } : { confirmed: false };
    }

    private rememberConnectorIdentities(context: IntegrationMigrationStepContext): void {
        for (const connector of context.connectors) {
            this.connectorInstanceIds.add(connector.connectorInstanceId);
        }
    }
}

class TestClock {
    private value = new Date("2026-07-26T10:00:00.000Z");

    now(): Date {
        return new Date(this.value);
    }

    advance(milliseconds: number): void {
        this.value = new Date(this.value.getTime() + milliseconds);
    }
}

export async function migrationFixture() {
    const installations = new InMemoryIntegrationInstallationRepository();
    const source = sourceDefinition();
    await installations.create({
        id: "commerce",
        label: "Commerce",
        definitionVersion: "1.0.0",
        definitionSnapshot: source,
        packageDigest: "e".repeat(64),
        connectorBindings: {
            primary: {
                connectorKey: "primary",
                provider: "supabase",
                lineageId: "commerce-supabase-v1",
                connectorInstanceId: "connector-instance-1",
                migrationRevision: 1,
                outputs: { functionsBaseUrl: "https://source.example/functions/v1" },
            },
        },
        connectorBaselineAdoptions: [
            {
                id: "1".repeat(64),
                actor: "fixture-admin",
                adoptedAt: new Date("2026-07-26T09:00:00.000Z"),
                sourceDefinitionVersion: "1.0.0",
                sourcePackageDigest: "e".repeat(64),
                targetDefinitionVersion: "1.1.0",
                targetPackageDigest: MIGRATION_DIGEST,
                connectorKey: "primary",
                provider: "supabase",
                lineageId: "commerce-supabase-v1",
                connectorInstanceId: "connector-instance-1",
                migrationRevision: 1,
                baselineDigest: "2".repeat(64),
                externalOperationId: "fixture-adoption",
            },
        ],
        status: "success",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
    });
    return {
        installations,
        source,
        target: fakeMigrationTargetDefinition(),
        runtime: new FakeMigrationRuntime(),
        clock: new TestClock(),
    };
}

export async function runMigrationFixture(fixture: Awaited<ReturnType<typeof migrationFixture>>, leaseMs = 60_000) {
    const installation = await fixture.installations.get("commerce");
    if (!installation) {
        throw new Error("missing fixture installation");
    }
    return await runDurableMigrationUpgrade({
        installations: fixture.installations,
        installation,
        targetDefinition: fixture.target,
        resolvedPackage: resolvedPackage(fixture.target),
        runtime: fixture.runtime,
        clock: fixture.clock,
        leaseMs,
    });
}

export async function runPublicMigrationFixture(fixture: Awaited<ReturnType<typeof migrationFixture>>) {
    return await runIntegrationInstallation({
        mode: "upgrade",
        deps: {
            sources: {} as never,
            secrets: {} as never,
            migrationRuntime: fixture.runtime,
            migrationClock: fixture.clock,
        },
        installations: fixture.installations,
        integrationId: "commerce",
        targetDefinition: fixture.target,
        packageResolver: { resolve: async () => resolvedPackage(fixture.target) },
    });
}

function resolvedPackage(definition: IntegrationDefinition) {
    return {
        root: "/tmp/cms-migration-target",
        kind: "commerce",
        version: "1.1.0",
        digest: MIGRATION_DIGEST,
        definition,
    };
}

function sourceDefinition(): IntegrationDefinition {
    return { kind: "commerce", label: "Commerce", version: "1.0.0", inputs: [] };
}
