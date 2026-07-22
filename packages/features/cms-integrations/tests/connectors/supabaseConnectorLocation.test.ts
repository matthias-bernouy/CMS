import { describe, expect, test } from "bun:test";
import { SupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import { createSupabaseConnectorFixture, userAccountDeployment } from "./supabaseFixtures";

describe("SupabaseConnectorDeployer package location", () => {
    test("deploys from a nested package with a manifest-defined version path", async () => {
        const root = await createSupabaseConnectorFixture({
            packageSegments: ["providers", "accounts"],
            versionPath: "releases/stable",
        });
        const requests: Array<{ url: string; init: RequestInit }> = [];
        const deployer = new SupabaseConnectorDeployer({
            integrationsRoot: root,
            projectRef: "abcdefghijklmnopqrst",
            accessToken: "sbp_test",
            apiBaseUrl: "https://api.supabase.test",
            fetch: async (input, init) => {
                requests.push({ url: String(input), init: init ?? {} });
                return new Response(null, { status: 201 });
            },
        });

        const result = await deployer.deploy(
            { ...userAccountDeployment(), dataApiSchemas: [], functions: [] },
            { answers: {}, generated: {}, secrets: {}, env: {} },
        );

        expect(result.resources).toEqual([
            { type: "schema", id: "schema.sql", action: "applied" },
            { type: "config", id: "postgrest.schema_cache", action: "applied" },
        ]);
        expect(JSON.parse(String(requests[0]?.init.body))).toEqual({
            query: "create schema if not exists user_account;\n",
        });
    });
});
