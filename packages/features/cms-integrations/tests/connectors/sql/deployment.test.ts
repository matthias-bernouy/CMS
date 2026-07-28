import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import {
    createSupabaseConnectorFixture,
    emptyContext,
    supabaseConnectorRoot,
    userAccountDeployment,
} from "../supabase/supabaseFixtures";

describe("Supabase SQL bundle deployment", () => {
    test("sends one atomic query for one manifest", async () => {
        const root = await createSupabaseConnectorFixture();
        await createBundle(root, "sql", "select 1;\n");
        const requests: Array<{ url: string; init: RequestInit }> = [];
        const deployment = schemaOnlyDeployment("sql/manifest.json");

        const result = await deployer(requests).deploy(deployment, emptyContext(root));

        expect(result.resources).toEqual([
            { type: "schema", id: "sql/manifest.json", action: "applied" },
            { type: "config", id: "postgrest.schema_cache", action: "applied" },
        ]);
        expect(requests).toHaveLength(2);
        expect(requests[0]?.url.endsWith("/database/query")).toBe(true);
        const query = JSON.parse(String(requests[0]?.init.body)).query as string;
        expect(query.startsWith("BEGIN;\n")).toBe(true);
        expect(query.endsWith("COMMIT;\n")).toBe(true);
        expect(requests[1]?.url.endsWith("/database/query")).toBe(true);
        expect(JSON.parse(String(requests[1]?.init.body)).query).toContain("reload schema");
    });

    test("applies several preloaded bundles in declaration order", async () => {
        const root = await createSupabaseConnectorFixture();
        await createBundle(root, "sql/first", "select 'first';\n");
        await createBundle(root, "sql/second", "select 'second';\n");
        const requests: Array<{ url: string; init: RequestInit }> = [];
        const deployment = schemaOnlyDeployment("sql/first/manifest.json");
        deployment.schemas.push({ manifest: "sql/second/manifest.json" });

        const result = await deployer(requests).deploy(deployment, emptyContext(root));

        expect(result.resources?.slice(0, 2)).toEqual([
            { type: "schema", id: "sql/first/manifest.json", action: "applied" },
            { type: "schema", id: "sql/second/manifest.json", action: "applied" },
        ]);
        const queries = requests.map(({ init }) => JSON.parse(String(init.body)).query as string);
        expect(queries[0]).toContain("'first'");
        expect(queries[1]).toContain("'second'");
    });

    test("preloads every schema before the first network request", async () => {
        const root = await createSupabaseConnectorFixture();
        const requests: Array<{ url: string; init: RequestInit }> = [];
        const deployment = schemaOnlyDeployment("sql/missing.json");
        deployment.schemas.unshift({ path: "schema.sql" });

        await expect(deployer(requests).deploy(deployment, emptyContext(root))).rejects.toThrow(/was not found/);

        expect(requests).toEqual([]);
    });

    test("does not reload PostgREST or deploy functions after SQL failure", async () => {
        const root = await createSupabaseConnectorFixture();
        await createBundle(root, "sql", "select 1;\n");
        const calls: string[] = [];
        const deployment = userAccountDeployment();
        deployment.schemas = [{ manifest: "sql/manifest.json" }];
        const failing = new SupabaseConnectorDeployer({
            projectRef: "abcdefghijklmnopqrst",
            accessToken: "sbp_test",
            apiBaseUrl: "https://api.supabase.test",
            fetch: async (input) => {
                calls.push(String(input));
                return new Response("query failed", { status: 500 });
            },
        });

        await expect(failing.deploy(deployment, emptyContext(root))).rejects.toThrow(/query failed/);

        expect(calls).toEqual(["https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/database/query"]);
    });
});

function schemaOnlyDeployment(manifest: string) {
    const deployment = userAccountDeployment();
    deployment.schemas = [{ manifest }];
    deployment.dataApiSchemas = [];
    deployment.functions = [];
    return deployment;
}

function deployer(requests: Array<{ url: string; init: RequestInit }>) {
    return new SupabaseConnectorDeployer({
        projectRef: "abcdefghijklmnopqrst",
        accessToken: "sbp_test",
        apiBaseUrl: "https://api.supabase.test",
        fetch: async (input, init) => {
            requests.push({ url: String(input), init: init ?? {} });
            return new Response(null, { status: 201 });
        },
    });
}

async function createBundle(root: string, path: string, sql: string): Promise<void> {
    const bundleRoot = join(supabaseConnectorRoot(root), path);
    await mkdir(bundleRoot, { recursive: true });
    await writeFile(
        join(bundleRoot, "manifest.json"),
        `${JSON.stringify({
            schema: "cms.integration.sql-bundle.v1",
            transaction: "atomic",
            entries: [{ file: "schema.sql" }],
        })}\n`,
    );
    await writeFile(join(bundleRoot, "schema.sql"), sql);
}
