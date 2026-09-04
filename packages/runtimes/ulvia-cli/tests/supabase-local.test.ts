import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocalSupabaseDatabase } from "../src/runtime/supabase-local/database";
import {
    inspectFunctionsRuntimeOutput,
    type LocalSupabaseFunctionsRuntime,
} from "../src/runtime/supabase-local/functions-runtime";
import { createLocalSupabaseManagementHandler } from "../src/runtime/supabase-local";
import { parseLocalSupabaseEnvironment } from "../src/runtime/supabase";
import { removeReadonlyTree } from "./fixtures";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map(removeReadonlyTree));
});

describe("local Supabase management bridge", () => {
    test("detects readiness before retaining only the bounded output tail", () => {
        const observation = inspectFunctionsRuntimeOutput(
            "prefix",
            `Serving functions on http://local\n${"x".repeat(512)}`,
        );

        expect(observation.ready).toBe(true);
        expect(observation.tail).toBe("x".repeat(256));
    });

    test("reads noisy Supabase status output and derives the Functions URL", () => {
        expect(
            parseLocalSupabaseEnvironment(
                `Stopped services: [edge_runtime]\n${JSON.stringify({
                    API_URL: "http://127.0.0.1:54321",
                    DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
                })}`,
            ),
        ).toEqual({
            apiUrl: "http://127.0.0.1:54321",
            functionsUrl: "http://127.0.0.1:54321/functions/v1",
            databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        });
    });

    test("retains local API capabilities without logging or embedding them in URLs", () => {
        expect(
            parseLocalSupabaseEnvironment(
                JSON.stringify({
                    API_URL: "http://127.0.0.1:54321",
                    DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
                    PUBLISHABLE_KEY: "sb_publishable_local_fixture",
                    SECRET_KEY: "sb_secret_local_fixture",
                }),
            ),
        ).toMatchObject({
            publishableKey: "sb_publishable_local_fixture",
            secretKey: "sb_secret_local_fixture",
        });
    });

    test("applies SQL and materializes secrets and reloadable Function bundles", async () => {
        const root = await projectRoot();
        const queries: string[] = [];
        let closed = false;
        let reloads = 0;
        let runtimeStopped = false;
        const database: LocalSupabaseDatabase = {
            query: async (source) => {
                queries.push(source);
                return [{ answer: "42" }];
            },
            close: async () => {
                closed = true;
            },
        };
        const functionsRuntime: LocalSupabaseFunctionsRuntime = {
            reload: async () => {
                reloads += 1;
            },
            stop: async () => {
                runtimeStopped = true;
            },
        };
        const token = "local-test-token-with-enough-entropy";
        const handler = await createLocalSupabaseManagementHandler({
            projectRoot: root,
            projectRef: "local",
            accessToken: token,
            databaseUrl: "postgresql://unused",
            port: 0,
            database,
            functionsRuntime,
        });
        const request = (path: string, init: RequestInit = {}) => {
            return handler.fetch(
                new Request(`http://127.0.0.1/v1/projects/local${path}`, {
                    ...init,
                    headers: { authorization: `Bearer ${token}`, ...init.headers },
                }),
            );
        };
        try {
            expect((await handler.fetch(new Request("http://127.0.0.1/v1/projects/local/postgrest"))).status).toBe(401);
            const query = await request("/database/query", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ query: "select 42 as answer" }),
            });
            expect(await query.json()).toEqual([{ answer: "42" }]);
            expect(queries).toEqual(["select 42 as answer"]);

            await request("/postgrest", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ db_schema: "public,demo" }),
            });
            expect(await (await request("/postgrest")).json()).toEqual({ db_schema: "public,demo" });

            await request("/secrets", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify([{ name: "DEMO_TOKEN", value: "line one\nline two" }]),
            });
            expect(await readFile(join(root, "supabase", "functions", ".env"), "utf8")).toBe(
                'DEMO_TOKEN="line one\\nline two"\n',
            );

            const deployed = await request("/functions/deploy?slug=demo-function", {
                method: "POST",
                body: functionBody('Deno.serve(() => new Response("first"));\n'),
            });
            expect(deployed.status).toBe(201);
            const receipt = (await deployed.json()) as { ezbr_sha256: string };
            expect(receipt.ezbr_sha256).toMatch(/^[a-f0-9]{64}$/);
            expect(await readFile(join(root, "supabase", "functions", "demo-function", "index.ts"), "utf8")).toContain(
                "first",
            );
            expect(
                await readFile(join(root, "supabase", "functions", "demo-function", "nested", "value.ts"), "utf8"),
            ).toBe("export const value = 1;\n");
            const config = await readFile(join(root, "supabase", "config.toml"), "utf8");
            expect(config).toContain("[functions.demo-function]");
            expect(config).toContain('entrypoint = "./functions/demo-function/index.ts"');
            expect(config).toContain("verify_jwt = false");
            expect(await (await request("/functions/demo-function")).json()).toMatchObject({ status: "ACTIVE" });
            expect(reloads).toBe(1);

            const stripeCreate = await handler.fetch(
                new Request("http://127.0.0.1/_stripe/v1/webhook_endpoints", {
                    method: "POST",
                    headers: { authorization: "Bearer sk_test_local" },
                    body: new URLSearchParams({
                        api_version: "2026-02-25.clover",
                        "metadata[cmscore_integration]": "stripe-connect",
                    }),
                }),
            );
            expect(await stripeCreate.json()).toMatchObject({
                id: expect.stringMatching(/^we_local_/),
                secret: expect.any(String),
            });
            const stripeList = await handler.fetch(
                new Request("http://127.0.0.1/_stripe/v1/webhook_endpoints", {
                    headers: { authorization: "Bearer sk_test_local" },
                }),
            );
            expect(await stripeList.json()).toMatchObject({ data: [{ api_version: "2026-02-25.clover" }] });
        } finally {
            await handler.close();
        }
        expect(closed).toBe(true);
        expect(runtimeStopped).toBe(true);

        let restartReloads = 0;
        const reopened = await createLocalSupabaseManagementHandler({
            projectRoot: root,
            projectRef: "local",
            accessToken: token,
            databaseUrl: "postgresql://unused",
            port: 0,
            database: { query: async () => [], close: async () => undefined },
            functionsRuntime: {
                reload: async () => {
                    restartReloads += 1;
                },
                stop: async () => undefined,
            },
        });
        expect(restartReloads).toBe(1);
        await reopened.close();
    });
});

function functionBody(source: string): FormData {
    const body = new FormData();
    body.append(
        "metadata",
        new Blob([JSON.stringify({ entrypoint_path: "index.ts", verify_jwt: false })], {
            type: "application/json",
        }),
        "metadata.json",
    );
    body.append("file", new Blob([source]), "index.ts");
    body.append("file", new Blob(["export const value = 1;\n"]), "nested/value.ts");
    return body;
}

async function projectRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "ulvia-supabase-local-"));
    roots.push(root);
    await mkdir(join(root, "supabase"), { recursive: true });
    await writeFile(join(root, "supabase", "config.toml"), 'project_id = "test"\n');
    return root;
}
