import { sha256Hex } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createRealMigrationPackageFixture() {
    const root = await packageRoot();
    return { root, target: await targetDefinition(root), source: sourceDefinition() };
}

async function packageRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-real-migration-"));
    const connector = join(root, "connectors", "supabase");
    await mkdir(join(connector, "migrations"), { recursive: true });
    await mkdir(join(connector, "functions", "cms-commerce-v2"), { recursive: true });
    await writeFile(join(connector, "migrations", "0002-expand.sql"), "ALTER TABLE orders ADD COLUMN note text;\n");
    await writeFile(join(connector, "migrations", "0003-contract.sql"), "ALTER TABLE orders DROP COLUMN legacy;\n");
    await writeFile(
        join(connector, "functions", "cms-commerce-v2", "index.ts"),
        "Deno.serve(() => Response.json({ ok: true }));\n",
    );
    return root;
}

async function targetDefinition(root: string): Promise<IntegrationDefinition> {
    const expand = await checksum(join(root, "connectors", "supabase", "migrations", "0002-expand.sql"));
    const contract = await checksum(join(root, "connectors", "supabase", "migrations", "0003-contract.sql"));
    const migrations = [
        migration("expand-orders", expand, 1, 2, "expand", "migrations/0002-expand.sql"),
        migration("contract-orders", contract, 2, 3, "contract", "migrations/0003-contract.sql"),
    ];
    return {
        kind: "commerce",
        label: "Commerce",
        version: "1.1.0",
        inputs: [],
        connectors: [
            {
                provider: "supabase",
                connectorKey: "primary",
                lineageId: "commerce-v1",
                migrationRevision: 3,
                migration: migrationPlan(migrations),
                root: "connectors/supabase",
                functions: [{ name: "cms-commerce-v2", directory: "functions/cms-commerce-v2" }],
            },
        ],
        artifacts: [sourceArtifact("cms-commerce-v2")],
    };
}

function migrationPlan(migrations: ReturnType<typeof migration>[]) {
    return {
        install: {
            revision: 3,
            digest: `sha256:${"f".repeat(64)}` as const,
            coveredMigrations: migrations.map((entry) => ({
                id: entry.id,
                checksum: entry.checksum,
                revision: entry.toRevision,
                introducedIn: entry.introducedIn,
            })),
        },
        migrations,
        supportedSources: [{ range: "^1.0.0", migrationRevision: 1 }],
        cmsMediated: { strategy: "binding-switch" as const, drainSeconds: 0 },
        providerDirect: { strategy: "expand-in-code" as const, callbackIds: ["stripe"], drainSeconds: 0 },
        pointOfNoReturn: "before-contract" as const,
    };
}

function sourceDefinition(): IntegrationDefinition {
    return {
        kind: "commerce",
        label: "Commerce",
        version: "1.0.0",
        inputs: [],
        connectors: [
            {
                provider: "supabase",
                connectorKey: "primary",
                functions: [{ name: "cms-commerce", directory: "functions/cms-commerce" }],
            },
        ],
        artifacts: [sourceArtifact("cms-commerce")],
    };
}

function sourceArtifact(slug: string) {
    return {
        type: "source" as const,
        source: {
            id: "commerce",
            meta: { name: "Commerce" },
            endpoints: [
                {
                    endpointId: "health",
                    method: "GET" as const,
                    targetUrl: `{{connectors.primary.functionsBaseUrl}}/${slug}/health`,
                    params: [],
                    output: [
                        {
                            status: "200",
                            body: { type: "object" as const, properties: { ok: { type: "boolean" as const } } },
                        },
                    ],
                },
            ],
        },
    };
}

function migration(
    id: string,
    checksumValue: `sha256:${string}`,
    fromRevision: number,
    toRevision: number,
    phase: "expand" | "contract",
    path: string,
) {
    return {
        id,
        checksum: checksumValue,
        fromRevision,
        toRevision,
        introducedIn: "1.1.0",
        transaction: "atomic" as const,
        phase,
        path,
    };
}

async function checksum(path: string): Promise<`sha256:${string}`> {
    return `sha256:${await sha256Hex(await Bun.file(path).bytes())}`;
}
