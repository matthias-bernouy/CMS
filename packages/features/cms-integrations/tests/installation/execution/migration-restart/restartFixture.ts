import type { IntegrationDefinition, IntegrationInstallation } from "@bernouy/cms-integrations";
import { runDurableMigrationUpgrade } from "@bernouy/cms-integrations";
import type { MongoIntegrationInstallationRepository } from "@bernouy/cms-integrations/mongo";
import { fakeMigrationTargetDefinition } from "../migration/fakeRuntimeDefinition";
import { createBsonInstallationRepository } from "./bsonMongoFixture";
import { PersistentMigrationRuntime } from "./persistentRuntime";

export const RESTART_MIGRATION_DIGEST = "f".repeat(64);
export const RESTART_MIGRATION_PHASES = [
    "expand",
    "deploy-functions",
    "smoke-target",
    "provider-direct-transition",
    "switch-cms-binding",
    "smoke-cms",
    "drain",
    "point-of-no-return",
    "contract",
] as const;

export class RestartMigrationClock {
    constructor(private value: Date) {}

    now(): Date {
        return new Date(this.value);
    }

    advance(milliseconds: number): void {
        this.value = new Date(this.value.getTime() + milliseconds);
    }
}

export type RestartMigrationRoot = Readonly<{
    installations: MongoIntegrationInstallationRepository;
    runtime: PersistentMigrationRuntime;
    clock: RestartMigrationClock;
    target: IntegrationDefinition;
}>;

export async function createRestartMigrationRoot(options: {
    installationStore: string;
    remoteStore: string;
    clock: RestartMigrationClock;
    crashAfterSucceededPhase?: (typeof RESTART_MIGRATION_PHASES)[number];
}): Promise<RestartMigrationRoot> {
    return {
        installations: await createBsonInstallationRepository({
            path: options.installationStore,
            ...(options.crashAfterSucceededPhase ? { crashAfterSucceededPhase: options.crashAfterSucceededPhase } : {}),
        }),
        runtime: new PersistentMigrationRuntime(options.remoteStore),
        clock: options.clock,
        target: fakeMigrationTargetDefinition(),
    };
}

export async function seedRestartMigration(root: RestartMigrationRoot): Promise<void> {
    const source = sourceDefinition();
    await root.installations.create({
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
                actor: "restart-test-admin",
                adoptedAt: new Date("2026-07-27T09:00:00.000Z"),
                sourceDefinitionVersion: "1.0.0",
                sourcePackageDigest: "e".repeat(64),
                targetDefinitionVersion: "1.1.0",
                targetPackageDigest: RESTART_MIGRATION_DIGEST,
                connectorKey: "primary",
                provider: "supabase",
                lineageId: "commerce-supabase-v1",
                connectorInstanceId: "connector-instance-1",
                migrationRevision: 1,
                baselineDigest: "2".repeat(64),
                externalOperationId: "restart-test-adoption",
            },
        ],
        status: "success",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
    });
}

export async function runRestartMigration(
    root: RestartMigrationRoot,
    installation?: IntegrationInstallation,
    leaseMs = 1_000,
) {
    const current = installation ?? (await root.installations.get("commerce"));
    if (!current) {
        throw new Error("restart migration fixture installation is missing");
    }
    return await runDurableMigrationUpgrade({
        installations: root.installations,
        installation: current,
        targetDefinition: root.target,
        resolvedPackage: {
            root: "/tmp/cms-migration-restart-target",
            kind: "commerce",
            version: "1.1.0",
            digest: RESTART_MIGRATION_DIGEST,
            definition: root.target,
        },
        runtime: root.runtime,
        clock: root.clock,
        leaseMs,
    });
}

function sourceDefinition(): IntegrationDefinition {
    return { kind: "commerce", label: "Commerce", version: "1.0.0", inputs: [] };
}
