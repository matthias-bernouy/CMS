import { describe, expect, test } from "bun:test";
import { SupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import { createSupabaseConnectorFixture, emptyContext, userAccountDeployment } from "./supabaseFixtures";

describe("SupabaseConnectorDeployer package location", () => {
    test("deploys from a resolved nested package root without a repository index", async () => {
        const root = await createSupabaseConnectorFixture({
            packageSegments: ["providers", "accounts"],
            versionPath: "releases/stable",
        });
        const requests: Array<{ url: string; init: RequestInit }> = [];
        const deployer = createDeployer(requests);

        const result = await deployer.deploy(
            { ...userAccountDeployment(), dataApiSchemas: [], functions: [] },
            { answers: {}, generated: {}, secrets: {}, packageRoot: root, env: {} },
        );

        expect(result.resources).toEqual([
            { type: "schema", id: "schema.sql", action: "applied" },
            { type: "config", id: "postgrest.schema_cache", action: "applied" },
        ]);
        expect(JSON.parse(String(requests[0]?.init.body))).toEqual({
            query: "create schema if not exists user_account;\n",
        });
    });

    test("requires the resolved package root before any network request", async () => {
        const requests: Array<{ url: string; init: RequestInit }> = [];

        await expect(createDeployer(requests).deploy(userAccountDeployment(), emptyContext())).rejects.toThrow(
            /requires a resolved package root/,
        );

        expect(requests).toEqual([]);
    });

    test("rejects connector roots that escape the resolved package", async () => {
        const root = await createSupabaseConnectorFixture();
        const deployment = { ...userAccountDeployment(), root: "../outside" };
        const requests: Array<{ url: string; init: RequestInit }> = [];

        await expect(createDeployer(requests).deploy(deployment, emptyContext(root))).rejects.toThrow(
            /escapes Supabase connector root/,
        );

        expect(requests).toEqual([]);
    });
});

function createDeployer(requests: Array<{ url: string; init: RequestInit }>): SupabaseConnectorDeployer {
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
