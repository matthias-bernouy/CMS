import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { IntegrationConnectorDeployment } from "@bernouy/cms-integrations";
import {
    computeSupabaseInstallDigest,
    loadSupabaseSqlSchemas,
    SupabaseConnectorDeployer,
} from "@bernouy/cms-integrations/supabase";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe("Supabase migration-aware fresh installation", () => {
    test("records the baseline and connector instance in the same database transaction", async () => {
        const root = await packageRoot();
        const connectorRoot = join(root, "connectors", "supabase");
        const schemas = [{ path: "install/schema.sql" }];
        const digest = await computeSupabaseInstallDigest(await loadSupabaseSqlSchemas(connectorRoot, schemas));
        const queries: string[] = [];
        const deployer = new SupabaseConnectorDeployer({
            projectRef: "project",
            accessToken: "access-token",
            fetch: async (_input, init) => {
                const body = JSON.parse(String(init?.body)) as { query: string };
                queries.push(body.query);
                return Response.json([]);
            },
        });

        const result = await deployer.deploy(deployment(digest), {
            answers: {},
            generated: {},
            secrets: {},
            packageRoot: root,
            env: {},
        });

        expect(result).toMatchObject({
            connectorKey: "primary",
            connectorInstanceId: "connector-instance-1",
            lineageId: "commerce-supabase-v1",
            migrationRevision: 0,
        });
        expect(queries[0]).toContain("BEGIN;");
        expect(queries[0]).toContain("CREATE TABLE public.orders");
        expect(queries[0]).toContain("connector-instance-1");
        expect(queries[0]).toContain("cms_integration_runtime.connector_instances");
        expect(queries[0]?.trim().endsWith("COMMIT;")).toBe(true);
    });

    test("fails before network mutation when the install baseline digest drifts", async () => {
        const root = await packageRoot();
        let calls = 0;
        const deployer = new SupabaseConnectorDeployer({
            projectRef: "project",
            accessToken: "access-token",
            fetch: async () => {
                calls += 1;
                return Response.json([]);
            },
        });

        await expect(
            deployer.deploy(deployment(`sha256:${"f".repeat(64)}`), {
                answers: {},
                generated: {},
                secrets: {},
                packageRoot: root,
                env: {},
            }),
        ).rejects.toThrow(/install baseline digest mismatch/);
        expect(calls).toBe(0);
    });
});

function deployment(digest: `sha256:${string}`): IntegrationConnectorDeployment {
    return {
        integrationKind: "commerce",
        version: "1.0.0",
        provider: "supabase",
        connectorKey: "primary",
        root: "connectors/supabase",
        dataApiSchemas: [],
        schemas: [{ path: "install/schema.sql" }],
        functions: [],
        migration: {
            connectorKey: "primary",
            lineageId: "commerce-supabase-v1",
            connectorInstanceId: "connector-instance-1",
            migrationRevision: 0,
            plan: {
                install: { revision: 0, digest, coveredMigrations: [] },
                migrations: [],
                supportedSources: [],
                pointOfNoReturn: "before-contract",
            },
        },
    };
}

async function packageRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-migration-package-"));
    roots.push(root);
    const install = join(root, "connectors", "supabase", "install");
    await mkdir(install, { recursive: true });
    await writeFile(join(install, "schema.sql"), "CREATE TABLE public.orders (id bigint PRIMARY KEY);\n");
    return root;
}
