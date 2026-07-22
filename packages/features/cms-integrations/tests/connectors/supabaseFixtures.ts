import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntegrationConnectorDeployContext, IntegrationConnectorDeployment } from "@bernouy/cms-integrations";

type SupabaseFixtureOptions = {
    packageSegments?: string[];
    versionPath?: string;
};

export async function createSupabaseConnectorFixture(options: SupabaseFixtureOptions = {}): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-integrations-supabase-"));
    const packageRoot = join(root, ...(options.packageSegments ?? []), "user-account");
    const versionPath = options.versionPath ?? "versions/1.0.0";
    const connectorRoot = join(packageRoot, versionPath, "connectors", "supabase");
    await mkdir(join(connectorRoot, "functions", "cms-user-account"), { recursive: true });
    await writeIndex(packageRoot, "user-account", versionPath);
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
    const packageRoot = join(root, "fixture");
    const versionPath = "versions/1.0.0";
    const connectorRoot = join(packageRoot, versionPath, "connectors", "supabase");
    await mkdir(connectorRoot, { recursive: true });
    await writeIndex(packageRoot, "fixture", versionPath);
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

async function writeIndex(packageRoot: string, kind: string, versionPath: string): Promise<void> {
    await writeFile(
        join(packageRoot, "integration.json"),
        `${JSON.stringify({
            kind,
            label: kind,
            stable: "1.0.0",
            versions: [
                {
                    version: "1.0.0",
                    path: versionPath,
                    definition: `${versionPath}/definition.json`,
                },
            ],
        })}\n`,
    );
}
