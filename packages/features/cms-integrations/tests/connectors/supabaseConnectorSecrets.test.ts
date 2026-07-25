import { describe, expect, test } from "bun:test";
import { SupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import { createSupabaseConnectorFixture, userAccountDeployment } from "./supabaseFixtures";

describe("SupabaseConnectorDeployer secrets", () => {
    test("merges provider function secrets before deploying functions", async () => {
        const root = await createSupabaseConnectorFixture();
        const requests: Array<{ url: string; init: RequestInit }> = [];
        const deployer = new SupabaseConnectorDeployer({
            projectRef: "abcdefghijklmnopqrst",
            accessToken: "sbp_test",
            apiBaseUrl: "https://api.supabase.test",
            fetch: async (input, init) => {
                requests.push({ url: String(input), init: init ?? {} });
                if (String(input).includes("/functions/deploy")) {
                    return Response.json({ id: "fn_1" }, { status: 201 });
                }
                return new Response(null, { status: 201 });
            },
            functionSecrets: {
                SMTP_HOST: "smtp.example.test",
                EMPTY_SECRET: "",
                CMS_USER_ACCOUNT_API_KEY: "provider-value",
            },
        });

        const result = await deployer.deploy(
            { ...userAccountDeployment("integration-value"), dataApiSchemas: [], schemas: [] },
            {
                answers: {},
                generated: { cmsApiKey: "integration-value" },
                secrets: { cmsApiKey: "${USER_ACCOUNT_API_KEY}" },
                packageRoot: root,
                env: {},
            },
        );

        expect(result.resources).toEqual([
            { type: "secret", id: "SMTP_HOST", action: "set" },
            { type: "secret", id: "CMS_USER_ACCOUNT_API_KEY", action: "set" },
            { type: "config", id: "supabase.config.toml", action: "applied" },
            { type: "function", id: "cms-user-account", action: "deployed" },
        ]);
        expect(requests.map((request) => [request.url, request.init.method])).toEqual([
            ["https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/secrets", "POST"],
            [
                "https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/functions/deploy?slug=cms-user-account",
                "POST",
            ],
        ]);
        expect(JSON.parse(String(requests[0]?.init.body))).toEqual([
            { name: "SMTP_HOST", value: "smtp.example.test" },
            { name: "CMS_USER_ACCOUNT_API_KEY", value: "integration-value" },
        ]);
    });

    test("redacts secret values from Supabase API errors", async () => {
        const root = await createSupabaseConnectorFixture();
        const deployer = new SupabaseConnectorDeployer({
            projectRef: "abcdefghijklmnopqrst",
            accessToken: "sbp_test",
            apiBaseUrl: "https://api.supabase.test",
            fetch: async (input, init) => {
                if (String(input).includes("/secrets")) {
                    return new Response("secret value cms_supersecret rejected", { status: 500 });
                }
                if (String(input).endsWith("/postgrest") && init?.method === "GET") {
                    return Response.json({ db_schema: "public,user_account" });
                }
                return new Response(null, { status: 201 });
            },
        });

        try {
            await deployer.deploy(userAccountDeployment("cms_supersecret"), {
                answers: {},
                generated: { cmsApiKey: "cms_supersecret" },
                secrets: { cmsApiKey: "${USER_ACCOUNT_API_KEY}" },
                packageRoot: root,
                env: {},
            });
            throw new Error("expected deploy to fail");
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain("Supabase API request failed (500)");
            expect((error as Error).message).not.toContain("cms_supersecret");
        }
    });
});
