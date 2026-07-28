import type { IntegrationDefinition } from "@bernouy/cms-integrations";

const CHECKSUM_A = `sha256:${"a".repeat(64)}` as const;
const CHECKSUM_B = `sha256:${"b".repeat(64)}` as const;

export function fakeMigrationTargetDefinition(): IntegrationDefinition {
    return {
        kind: "commerce",
        label: "Commerce",
        version: "1.1.0",
        inputs: [],
        connectors: [migrationConnector()],
    };
}

export function fakeMigrationTargetWithSource(
    options: { providerDirectOnly?: boolean; targetUrl?: string } = {},
): IntegrationDefinition {
    const target = fakeMigrationTargetDefinition();
    const connectors = (target.connectors ?? []).map((connector) => ({
        ...connector,
        ...(options.providerDirectOnly && connector.migration
            ? { migration: { ...connector.migration, cmsMediated: undefined } }
            : {}),
    }));
    return {
        ...target,
        connectors,
        inputs: [{ name: "id", label: "Source id", type: "text", required: true }],
        artifacts: [
            {
                type: "source",
                source: {
                    id: "{{answers.id}}",
                    meta: { name: "Commerce" },
                    endpoints: [
                        {
                            endpointId: "setup",
                            method: "POST",
                            access: { mode: "system" },
                            targetUrl: options.targetUrl ?? "https://connector.example/v2/setup",
                            params: [],
                            output: [{ status: "200", body: { type: "object" } }],
                        },
                    ],
                },
            },
        ],
    };
}

function migrationConnector(): NonNullable<IntegrationDefinition["connectors"]>[number] {
    const migrations = [
        migration("expand-orders", CHECKSUM_A, 1, 2, "expand", "migrations/0002-expand-orders.sql"),
        migration("cleanup-orders", CHECKSUM_B, 2, 3, "contract", "migrations/0003-cleanup-orders.sql"),
    ];
    return {
        provider: "supabase",
        connectorKey: "primary",
        lineageId: "commerce-supabase-v1",
        migrationRevision: 3,
        root: "connectors/supabase",
        schemas: [{ manifest: "install/schema.json" }],
        functions: [{ name: "cms-commerce-v2", directory: "functions/cms-commerce-v2" }],
        migration: {
            install: {
                revision: 3,
                digest: CHECKSUM_A,
                coveredMigrations: migrations.map((entry) => ({
                    id: entry.id,
                    checksum: entry.checksum,
                    revision: entry.toRevision,
                    introducedIn: entry.introducedIn,
                })),
            },
            migrations,
            supportedSources: [{ range: "^1.0.0", migrationRevision: 1 }],
            cmsMediated: { strategy: "binding-switch", drainSeconds: 30 },
            providerDirect: { strategy: "expand-in-code", callbackIds: ["stripe-webhook"], drainSeconds: 60 },
            pointOfNoReturn: "before-contract",
        },
    };
}

function migration(
    id: string,
    checksum: typeof CHECKSUM_A | typeof CHECKSUM_B,
    fromRevision: number,
    toRevision: number,
    phase: "expand" | "contract",
    path: string,
) {
    return {
        id,
        checksum,
        fromRevision,
        toRevision,
        introducedIn: "1.1.0",
        transaction: "atomic" as const,
        phase,
        path,
    };
}
