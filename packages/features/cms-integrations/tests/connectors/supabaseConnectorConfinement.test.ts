import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import { createSupabaseConnectorFixture, emptyContext, userAccountDeployment } from "./supabaseFixtures";

describe("SupabaseConnectorDeployer real-path confinement", () => {
    test("rejects a schema symlink outside the connector root", async () => {
        const root = await createSupabaseConnectorFixture();
        const schemaPath = join(connectorRoot(root), "schema.sql");
        await rm(schemaPath);
        await symlink(await outsideFile("schema.sql", "select current_user;\n"), schemaPath, "file");
        const calls: string[] = [];
        const deployment = userAccountDeployment();
        deployment.dataApiSchemas = [];
        deployment.functions = [];

        await expect(createDeployer(root, calls).deploy(deployment, emptyContext())).rejects.toThrow(
            /escapes Supabase connector root/,
        );
        expect(calls).toEqual([]);
    });

    test("rejects a function directory symlink outside the connector root", async () => {
        const root = await createSupabaseConnectorFixture();
        const functionPath = join(connectorRoot(root), "functions", "cms-user-account");
        await rm(functionPath, { recursive: true });
        const outside = await mkdtemp(join(tmpdir(), "cms-integrations-outside-function-"));
        await writeFile(join(outside, "index.ts"), 'Deno.serve(() => new Response("outside"));\n');
        await symlink(outside, functionPath, "dir");
        const calls: string[] = [];

        await expect(createDeployer(root, calls).deploy(functionOnlyDeployment(), emptyContext())).rejects.toThrow(
            /escapes Supabase connector root/,
        );
        expect(calls).toEqual([]);
    });

    test("rejects a function config symlink outside the connector root", async () => {
        const root = await createSupabaseConnectorFixture();
        const configPath = join(connectorRoot(root), "supabase.config.toml");
        await rm(configPath);
        await symlink(
            await outsideFile("supabase.config.toml", "[functions.cms-user-account]\nverify_jwt = false\n"),
            configPath,
            "file",
        );
        const calls: string[] = [];

        await expect(createDeployer(root, calls).deploy(functionOnlyDeployment(), emptyContext())).rejects.toThrow(
            /escapes Supabase connector root/,
        );
        expect(calls).toEqual([]);
    });
});

function connectorRoot(root: string): string {
    return join(root, "user-account", "versions", "1.0.0", "connectors", "supabase");
}

function functionOnlyDeployment() {
    const deployment = userAccountDeployment();
    deployment.schemas = [];
    deployment.dataApiSchemas = [];
    deployment.functions[0]!.secrets = {};
    return deployment;
}

function createDeployer(root: string, calls: string[]): SupabaseConnectorDeployer {
    return new SupabaseConnectorDeployer({
        integrationsRoot: root,
        projectRef: "abcdefghijklmnopqrst",
        accessToken: "sbp_test",
        apiBaseUrl: "https://api.supabase.test",
        fetch: async (input) => {
            calls.push(String(input));
            return new Response(null, { status: 201 });
        },
    });
}

async function outsideFile(name: string, contents: string): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-integrations-outside-file-"));
    await mkdir(root, { recursive: true });
    const path = join(root, name);
    await writeFile(path, contents);
    return path;
}
