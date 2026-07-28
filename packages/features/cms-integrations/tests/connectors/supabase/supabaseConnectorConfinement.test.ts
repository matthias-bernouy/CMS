import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SUPABASE_FUNCTION_BUNDLE_LIMITS, SupabaseConnectorDeployer } from "@bernouy/cms-integrations/supabase";
import {
    createSupabaseConnectorFixture,
    emptyContext,
    supabaseConnectorRoot,
    userAccountDeployment,
} from "./supabaseFixtures";

describe("SupabaseConnectorDeployer real-path confinement", () => {
    test("rejects a schema symlink outside the connector root", async () => {
        const root = await createSupabaseConnectorFixture();
        const schemaPath = join(supabaseConnectorRoot(root), "schema.sql");
        await rm(schemaPath);
        await symlink(await outsideFile("schema.sql", "select current_user;\n"), schemaPath, "file");
        const calls: string[] = [];
        const deployment = userAccountDeployment();
        deployment.dataApiSchemas = [];
        deployment.functions = [];

        await expect(createDeployer(calls).deploy(deployment, emptyContext(root))).rejects.toThrow(
            /escapes Supabase connector root/,
        );
        expect(calls).toEqual([]);
    });

    test("rejects a function directory symlink outside the connector root", async () => {
        const root = await createSupabaseConnectorFixture();
        const functionPath = join(supabaseConnectorRoot(root), "functions", "cms-user-account");
        await rm(functionPath, { recursive: true });
        const outside = await mkdtemp(join(tmpdir(), "cms-integrations-outside-function-"));
        await writeFile(join(outside, "index.ts"), 'Deno.serve(() => new Response("outside"));\n');
        await symlink(outside, functionPath, "dir");
        const calls: string[] = [];

        await expect(createDeployer(calls).deploy(functionOnlyDeployment(), emptyContext(root))).rejects.toThrow(
            /escapes Supabase connector root/,
        );
        expect(calls).toEqual([]);
    });

    test("rejects a function config symlink outside the connector root", async () => {
        const root = await createSupabaseConnectorFixture();
        const configPath = join(supabaseConnectorRoot(root), "supabase.config.toml");
        await rm(configPath);
        await symlink(
            await outsideFile("supabase.config.toml", "[functions.cms-user-account]\nverify_jwt = false\n"),
            configPath,
            "file",
        );
        const calls: string[] = [];

        await expect(createDeployer(calls).deploy(functionOnlyDeployment(), emptyContext(root))).rejects.toThrow(
            /escapes Supabase connector root/,
        );
        expect(calls).toEqual([]);
    });

    test("rejects internal symlinks in function bundles", async () => {
        const root = await createSupabaseConnectorFixture();
        const functionRoot = join(supabaseConnectorRoot(root), "functions", "cms-user-account");
        await symlink("index.ts", join(functionRoot, "alias.ts"), "file");
        const calls: string[] = [];

        await expect(createDeployer(calls).deploy(functionOnlyDeployment(), emptyContext(root))).rejects.toThrow(
            /must not contain symlinks/,
        );
        expect(calls).toEqual([]);
    });

    test("rejects special files in function bundles without opening them", async () => {
        const root = await createSupabaseConnectorFixture();
        const functionRoot = join(supabaseConnectorRoot(root), "functions", "cms-user-account");
        const fifo = join(functionRoot, "stream.pipe");
        expect(Bun.spawnSync(["mkfifo", fifo]).exitCode).toBe(0);
        const calls: string[] = [];

        await expect(createDeployer(calls).deploy(functionOnlyDeployment(), emptyContext(root))).rejects.toThrow(
            /regular file or directory/,
        );
        expect(calls).toEqual([]);
    });

    test("bounds individual function files before deployment", async () => {
        const root = await createSupabaseConnectorFixture();
        const entrypoint = join(supabaseConnectorRoot(root), "functions", "cms-user-account", "index.ts");
        await writeFile(entrypoint, "x".repeat(SUPABASE_FUNCTION_BUNDLE_LIMITS.maxFileBytes + 1));
        const calls: string[] = [];

        await expect(createDeployer(calls).deploy(functionOnlyDeployment(), emptyContext(root))).rejects.toThrow(
            new RegExp(`exceeds ${SUPABASE_FUNCTION_BUNDLE_LIMITS.maxFileBytes} decoded bytes`),
        );
        expect(calls).toEqual([]);
    });

    test("bounds function bundle depth before deployment", async () => {
        const root = await createSupabaseConnectorFixture();
        let directory = join(supabaseConnectorRoot(root), "functions", "cms-user-account");
        for (let index = 0; index < SUPABASE_FUNCTION_BUNDLE_LIMITS.maxDepth; index += 1) {
            directory = join(directory, `nested-${index}`);
        }
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, "too-deep.ts"), "export {};\n");
        const calls: string[] = [];

        await expect(createDeployer(calls).deploy(functionOnlyDeployment(), emptyContext(root))).rejects.toThrow(
            new RegExp(`exceeds depth ${SUPABASE_FUNCTION_BUNDLE_LIMITS.maxDepth}`),
        );
        expect(calls).toEqual([]);
    });

    test("bounds function configuration before deployment", async () => {
        const root = await createSupabaseConnectorFixture();
        const config = join(supabaseConnectorRoot(root), "supabase.config.toml");
        await writeFile(config, "x".repeat(1_024 * 1_024 + 1));
        const calls: string[] = [];

        await expect(createDeployer(calls).deploy(functionOnlyDeployment(), emptyContext(root))).rejects.toThrow(
            /exceeds 1048576 decoded bytes/,
        );
        expect(calls).toEqual([]);
    });
});

function functionOnlyDeployment() {
    const deployment = userAccountDeployment();
    deployment.schemas = [];
    deployment.dataApiSchemas = [];
    deployment.functions[0]!.secrets = {};
    return deployment;
}

function createDeployer(calls: string[]): SupabaseConnectorDeployer {
    return new SupabaseConnectorDeployer({
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
