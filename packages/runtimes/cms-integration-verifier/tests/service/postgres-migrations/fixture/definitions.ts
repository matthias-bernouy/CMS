import type { DeclarativeConnectorMigrationPlan } from "@bernouy/cms-integrations";

const KIND = "migration-probe";
const CONNECTOR_ROOT = "connectors/supabase";

export function sourceDefinition(installDigest: `sha256:${string}`, schema: unknown = sourceSchema()) {
    return {
        kind: KIND,
        label: "Migration Probe",
        version: "1.0.0",
        inputs: [],
        connectors: [
            connectorDefinition(schema, 0, {
                install: { revision: 0, digest: installDigest, coveredMigrations: [] },
                migrations: [],
                supportedSources: [],
                pointOfNoReturn: "before-contract",
            }),
        ],
    };
}

export function legacySourceDefinition() {
    return {
        kind: KIND,
        label: "Migration Probe",
        version: "1.0.0",
        inputs: [],
        connectors: [
            {
                provider: "supabase",
                root: CONNECTOR_ROOT,
                schemas: [{ manifest: "install/schema.manifest.json" }],
                compatibility: { schema: sourceSchema() },
            },
        ],
    };
}

export function targetDefinition(plan: DeclarativeConnectorMigrationPlan, schema: unknown = targetSchema()) {
    return {
        kind: KIND,
        label: "Migration Probe",
        version: "1.1.0",
        inputs: [],
        connectors: [connectorDefinition(schema, 1, plan)],
    };
}

function connectorDefinition(schema: unknown, migrationRevision: number, migration: DeclarativeConnectorMigrationPlan) {
    return {
        provider: "supabase",
        connectorKey: "primary",
        lineageId: "migration-probe-v1",
        migrationRevision,
        migration,
        root: CONNECTOR_ROOT,
        schemas: [{ manifest: "install/schema.manifest.json" }],
        compatibility: { schema },
    };
}

function sourceSchema() {
    return schemaContract([{ name: "id", type: "bigint", nullable: false }]);
}

function targetSchema() {
    return schemaContract([
        { name: "description", type: "text", nullable: true },
        { name: "id", type: "bigint", nullable: false },
    ]);
}

function schemaContract(columns: readonly unknown[]) {
    return {
        namespaces: [
            {
                name: "migration_probe",
                relations: [
                    {
                        name: "items",
                        kind: "table",
                        columns,
                        constraints: [{ kind: "primary-key", name: "items_pkey", columns: ["id"] }],
                    },
                ],
            },
        ],
    };
}
