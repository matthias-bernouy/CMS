import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntegrationConnectorDeployContext, IntegrationConnectorDeployment } from "@bernouy/cms-integrations";

export async function createSupabaseConnectorFixture(): Promise<string> {
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

export function userAccountDeployment(secret = "cms_abc"): IntegrationConnectorDeployment {
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

export async function createSchemaFixture(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-integrations-configured-supabase-"));
    const connectorRoot = join(root, "fixture", "versions", "1.0.0", "connectors", "supabase");
    await mkdir(connectorRoot, { recursive: true });
    await writeFile(join(connectorRoot, "schema.sql"), "select 1;\n");
    return root;
}

export function schemaDeployment(): IntegrationConnectorDeployment {
    return {
        ...emptyDeployment(),
        root: "connectors/supabase",
        schemas: [{ path: "schema.sql" }],
    };
}

export function emptyDeployment(): IntegrationConnectorDeployment {
    return {
        integrationKind: "fixture",
        version: "1.0.0",
        provider: "supabase",
        dataApiSchemas: [],
        schemas: [],
        functions: [],
    };
}

export function emptyContext(): IntegrationConnectorDeployContext {
    return { answers: {}, generated: {}, secrets: {}, env: {} };
}
