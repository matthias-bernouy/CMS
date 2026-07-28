import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntegrationMigrationStepContext } from "@bernouy/cms-integrations";
import { SupabaseFunctionMigrationHandler } from "@bernouy/cms-integrations/supabase";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe("Supabase migration Function deployment", () => {
    test("deploys a side-by-side target and confirms the exact remote bundle digest", async () => {
        const root = await functionPackage();
        const deployed = new Map<string, string>();
        const handler = new SupabaseFunctionMigrationHandler({
            projectRef: "project",
            accessToken: "token",
            fetch: async (input, init) => {
                const url = new URL(String(input));
                const slug = url.searchParams.get("slug") ?? url.pathname.split("/").at(-1)!;
                if (init?.method === "POST") {
                    deployed.set(slug, "bundle-v2");
                }
                return Response.json({ slug, status: "ACTIVE", ezbr_sha256: deployed.get(slug) ?? "missing" });
            },
        });
        const context = migrationContext(root);

        const executed = await handler.execute(context);
        expect(deployed.get("cms-commerce-v2")).toBe("bundle-v2");
        expect(await handler.confirm(context, executed)).toMatchObject({ confirmed: true });

        deployed.set("cms-commerce-v2", "drifted");
        expect(await handler.confirm(context, executed)).toEqual({ confirmed: false });
    });

    test("refuses to describe an in-place Function overwrite as a CMS binding switch", async () => {
        const root = await functionPackage();
        const context = migrationContext(root);
        context.targetDefinition.connectors![0]!.functions![0]!.name = "cms-commerce";
        const handler = new SupabaseFunctionMigrationHandler({
            projectRef: "project",
            accessToken: "token",
            fetch: async () => Response.json({}),
        });

        await expect(handler.execute(context)).rejects.toThrow(/requires a target Function slug deployed alongside/);
    });
});

async function functionPackage(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-function-migration-"));
    roots.push(root);
    const directory = join(root, "connectors", "supabase", "functions", "cms-commerce-v2");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.ts"), "Deno.serve(() => new Response('ok'));\n");
    return root;
}

function migrationContext(root: string): IntegrationMigrationStepContext {
    const plan = {
        install: { revision: 1, digest: `sha256:${"a".repeat(64)}` as const, coveredMigrations: [] },
        migrations: [],
        supportedSources: [{ range: "^1.0.0", migrationRevision: 0 }],
        cmsMediated: { strategy: "binding-switch" as const },
        pointOfNoReturn: "before-contract" as const,
    };
    const connector = {
        connectorKey: "primary",
        provider: "supabase",
        lineageId: "commerce-v1",
        connectorInstanceId: "instance-1",
        fromRevision: 0,
        toRevision: 1,
        plan,
    };
    const sourceDefinition = {
        kind: "commerce",
        label: "Commerce",
        version: "1.0.0",
        inputs: [],
        connectors: [
            {
                provider: "supabase",
                connectorKey: "primary",
                functions: [{ name: "cms-commerce", directory: "functions/cms-commerce" }],
            },
        ],
    };
    const targetDefinition = {
        kind: "commerce",
        label: "Commerce",
        version: "1.1.0",
        inputs: [],
        connectors: [
            {
                provider: "supabase",
                connectorKey: "primary",
                lineageId: "commerce-v1",
                migrationRevision: 1,
                migration: plan,
                root: "connectors/supabase",
                functions: [{ name: "cms-commerce-v2", directory: "functions/cms-commerce-v2" }],
            },
        ],
    };
    const now = new Date("2026-07-26T00:00:00.000Z");
    const installation = {
        id: "commerce",
        label: "Commerce",
        definitionVersion: "1.0.0",
        definitionSnapshot: sourceDefinition,
        packageDigest: "b".repeat(64),
        status: "pending" as const,
        createdAt: now,
        updatedAt: now,
        runCount: 0,
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
        artifacts: [],
        runs: [],
    };
    const operation = {
        id: "operation-1",
        revision: 1,
        status: "running" as const,
        currentVersion: "1.0.0",
        currentPackageDigest: "b".repeat(64),
        targetVersion: "1.1.0",
        targetPackageDigest: "c".repeat(64),
        sourceDefinition,
        targetDefinition,
        connectors: [connector],
        attemptId: "attempt-1",
        fencingToken: 1,
        leaseExpiresAt: new Date("2026-07-26T01:00:00.000Z"),
        startedAt: now,
        updatedAt: now,
        journal: [],
    };
    return {
        phase: "deploy-functions",
        idempotencyKey: "step-1",
        targetDigest: "d".repeat(64),
        operation,
        installation: { ...installation, migrationOperation: operation },
        sourceDefinition,
        targetDefinition,
        targetPackageRoot: root,
        connectors: [connector],
    };
}
