import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { SupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import type { IntegrationConnectorDeployment } from "@bernouy/cms-integrations";

describe("SupabaseConnectorDeployer", () => {
    test("applies schemas, sets function secrets, and deploys functions through the Management API", async () => {
        const root = await createSupabaseConnectorFixture();
        const requests: Array<{ url: string; init: RequestInit }> = [];
        const fetchImpl: typeof fetch = async (input, init) => {
            requests.push({ url: String(input), init: init ?? {} });
            if (String(input).endsWith("/postgrest") && init?.method === "GET") {
                return Response.json({
                    db_schema: "public,storage",
                    max_rows: 1000,
                    db_extra_search_path: "public",
                    db_pool: null,
                    db_pool_acquisition_timeout: null,
                });
            }
            if (String(input).includes("/functions/deploy")) {
                return Response.json(
                    { id: "fn_1", slug: "cms-user-account", name: "CMS User Account", status: "ACTIVE", version: 1 },
                    { status: 201 },
                );
            }
            return new Response(null, { status: init?.method === "PATCH" ? 200 : 201 });
        };
        const deployer = new SupabaseConnectorDeployer({
            integrationsRoot: root,
            projectRef: "abcdefghijklmnopqrst",
            accessToken: "sbp_test",
            apiBaseUrl: "https://api.supabase.test",
            fetch: fetchImpl,
        });

        const result = await deployer.deploy(userAccountDeployment(), {
            answers: {},
            generated: { cmsApiKey: "cms_abc" },
            secrets: { cmsApiKey: "${USER_ACCOUNT_API_KEY}" },
            env: {},
        });

        expect(result).toEqual({
            provider: "supabase",
            outputs: { functionsBaseUrl: "https://abcdefghijklmnopqrst.supabase.co/functions/v1" },
            resources: [
                { type: "schema", id: "schema.sql", action: "applied" },
                { type: "config", id: "postgrest.db_schema", action: "applied" },
                { type: "config", id: "postgrest.database_role", action: "applied" },
                { type: "config", id: "postgrest.schema_cache", action: "applied" },
                { type: "secret", id: "CMS_USER_ACCOUNT_API_KEY", action: "set" },
                { type: "config", id: "supabase.config.toml", action: "applied" },
                { type: "function", id: "cms-user-account", action: "deployed" },
            ],
        });
        expect(requests.map((request) => [request.url, request.init.method])).toEqual([
            ["https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/database/query", "POST"],
            ["https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/postgrest", "GET"],
            ["https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/postgrest", "PATCH"],
            ["https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/database/query", "POST"],
            ["https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/database/query", "POST"],
            ["https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/secrets", "POST"],
            [
                "https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/functions/deploy?slug=cms-user-account",
                "POST",
            ],
        ]);
        expect(JSON.parse(String(requests[0]?.init.body))).toEqual({
            query: "create schema if not exists user_account;\n",
        });
        expect(JSON.parse(String(requests[2]?.init.body))).toEqual({ db_schema: "public,storage,user_account" });
        expect(JSON.parse(String(requests[3]?.init.body))).toEqual({
            query: "alter role authenticator set pgrst.db_schemas = 'public,storage,user_account';\nalter role authenticator set pgrst.db_schema = 'public,storage,user_account';",
        });
        expect(JSON.parse(String(requests[4]?.init.body))).toEqual({
            query: "notify pgrst, 'reload config';\nnotify pgrst, 'reload schema';",
        });
        expect(JSON.parse(String(requests[5]?.init.body))).toEqual([
            { name: "CMS_USER_ACCOUNT_API_KEY", value: "cms_abc" },
        ]);
        const deployBody = requests[6]?.init.body;
        expect(deployBody).toBeInstanceOf(FormData);
        const metadata = (deployBody as FormData).get("metadata");
        expect(metadata).toBeInstanceOf(Blob);
        expect(JSON.parse(await (metadata as Blob).text())).toEqual({
            entrypoint_path: "index.ts",
            verify_jwt: false,
        });
        const files = (deployBody as FormData).getAll("file") as Array<Blob & { name?: string }>;
        expect(files.map((file) => file.name)).toEqual(["index.ts"]);
        expect(await files[0]?.text()).toBe('Deno.serve(() => new Response("ok"));\n');
        expect(
            requests.every((request) => new Headers(request.init.headers).get("authorization") === "Bearer sbp_test"),
        ).toBe(true);
    });

    test("reloads the PostgREST schema cache when a Data API schema is already exposed", async () => {
        const root = await createSupabaseConnectorFixture();
        const requests: Array<{ url: string; init: RequestInit }> = [];
        const deployer = new SupabaseConnectorDeployer({
            integrationsRoot: root,
            projectRef: "abcdefghijklmnopqrst",
            accessToken: "sbp_test",
            apiBaseUrl: "https://api.supabase.test",
            fetch: async (input, init) => {
                requests.push({ url: String(input), init: init ?? {} });
                if (String(input).endsWith("/postgrest") && init?.method === "GET") {
                    return Response.json({ db_schema: "public,user_account" });
                }
                return new Response(null, { status: 201 });
            },
        });

        const result = await deployer.deploy(
            { ...userAccountDeployment(), functions: [] },
            {
                answers: {},
                generated: {},
                secrets: {},
                env: {},
            },
        );

        expect(result.resources).toEqual([
            { type: "schema", id: "schema.sql", action: "applied" },
            { type: "config", id: "postgrest.db_schema", action: "skipped" },
            { type: "config", id: "postgrest.database_role", action: "applied" },
            { type: "config", id: "postgrest.schema_cache", action: "applied" },
        ]);
        expect(requests.map((request) => [request.url, request.init.method])).toEqual([
            ["https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/database/query", "POST"],
            ["https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/postgrest", "GET"],
            ["https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/database/query", "POST"],
            ["https://api.supabase.test/v1/projects/abcdefghijklmnopqrst/database/query", "POST"],
        ]);
        expect(JSON.parse(String(requests[2]?.init.body))).toEqual({
            query: "alter role authenticator set pgrst.db_schemas = 'public,user_account';\nalter role authenticator set pgrst.db_schema = 'public,user_account';",
        });
        expect(JSON.parse(String(requests[3]?.init.body))).toEqual({
            query: "notify pgrst, 'reload config';\nnotify pgrst, 'reload schema';",
        });
    });

    test("merges provider function secrets before deploying functions", async () => {
        const root = await createSupabaseConnectorFixture();
        const requests: Array<{ url: string; init: RequestInit }> = [];
        const deployer = new SupabaseConnectorDeployer({
            integrationsRoot: root,
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
            {
                ...userAccountDeployment("integration-value"),
                dataApiSchemas: [],
                schemas: [],
            },
            {
                answers: {},
                generated: { cmsApiKey: "integration-value" },
                secrets: { cmsApiKey: "${USER_ACCOUNT_API_KEY}" },
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
            integrationsRoot: root,
            projectRef: "abcdefghijklmnopqrst",
            accessToken: "sbp_test",
            apiBaseUrl: "https://api.supabase.test",
            fetch: async (input, init) => {
                if (String(input).includes("/secrets")) {
                    return new Response("secret value cms_supersecret rejected", { status: 500 });
                }
                if (String(input).endsWith("/postgrest") && init?.method === "GET") {
                    return Response.json({
                        db_schema: "public,user_account",
                        max_rows: 1000,
                        db_extra_search_path: "public",
                        db_pool: null,
                        db_pool_acquisition_timeout: null,
                    });
                }
                return new Response(null, { status: 201 });
            },
        });

        try {
            await deployer.deploy(userAccountDeployment("cms_supersecret"), {
                answers: {},
                generated: { cmsApiKey: "cms_supersecret" },
                secrets: { cmsApiKey: "${USER_ACCOUNT_API_KEY}" },
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

async function createSupabaseConnectorFixture(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-integrations-supabase-"));
    const connectorRoot = join(root, "user-account", "versions", "1.0.0", "connectors", "supabase");
    await mkdir(join(connectorRoot, "functions", "cms-user-account"), { recursive: true });
    await writeFile(join(connectorRoot, "schema.sql"), "create schema if not exists user_account;\n");
    await writeFile(join(connectorRoot, "supabase.config.toml"), "[functions.cms-user-account]\nverify_jwt = false\n");
    await writeFile(
        join(connectorRoot, "functions", "cms-user-account", "index.ts"),
        'Deno.serve(() => new Response("ok"));\n',
    );
    return root;
}

function userAccountDeployment(secret = "cms_abc"): IntegrationConnectorDeployment {
    return {
        integrationKind: "user-account",
        version: "1.0.0",
        provider: "supabase",
        root: "connectors/supabase",
        dataApiSchemas: ["user_account"],
        schemas: [{ path: "schema.sql" }],
        functions: [
            {
                name: "cms-user-account",
                directory: "functions/cms-user-account",
                configPath: "supabase.config.toml",
                secrets: { CMS_USER_ACCOUNT_API_KEY: secret },
            },
        ],
    };
}
