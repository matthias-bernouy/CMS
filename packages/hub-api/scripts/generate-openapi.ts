/**
 * Walks `src/api/*.ts`, reads each endpoint's `meta` export + derives method+path
 * from the filename, and emits `openapi.json` at the package root.
 *
 * Run:
 *   cd packages/hub-api && bun run scripts/generate-openapi.ts
 *
 * The output is committed (it IS the API contract). To regenerate, re-run.
 */

import { join, relative, basename, dirname } from "node:path";
import { writeFileSync } from "node:fs";
import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { z } from "src/core/schemas/zodInit";
import type { ApiOperationMeta } from "src/core/schemas/operationMeta";
import { hubApiPackageRoot } from "src/constants";

const API_DIR     = join(hubApiPackageRoot, "src/api");
const OUT_PATH    = join(hubApiPackageRoot, "openapi.json");
const API_PREFIX  = "/api";   // matches `mountHubApi`'s default — public health is described too, see below
const VERSION     = "0.1.0";

type EndpointFile = { method: HttpMethod; route: string; meta: ApiOperationMeta };
type HttpMethod   = "get" | "post" | "put" | "patch" | "delete" | "options";

const HTTP_METHODS: readonly HttpMethod[] = ["get", "post", "put", "patch", "delete", "options"] as const;

async function main(): Promise<void> {
    const registry = new OpenAPIRegistry();
    const endpoints = await collectEndpoints();

    for (const ep of endpoints) {
        const fullPath = `${API_PREFIX}${ep.route.startsWith("/") ? ep.route : "/" + ep.route}`;
        registry.registerPath({
            method:      ep.method,
            path:        fullPath,
            summary:     ep.meta.summary,
            description: ep.meta.description,
            operationId: ep.meta.operationId,
            tags:        ep.meta.tags,
            ...(ep.meta.requiresAuth !== false ? { security: [{ bearerAuth: [] }] } : {}),
            request: {
                ...(ep.meta.request?.body  ? { body:  { content: { "application/json": { schema: ep.meta.request.body  } } } } : {}),
                ...(ep.meta.request?.query ? { query: ep.meta.request.query                                                  } : {}),
            },
            responses: Object.fromEntries(Object.entries(ep.meta.responses).map(([code, r]) => [code, {
                description: r.description,
                ...(r.schema ? { content: { "application/json": { schema: r.schema } } } : {}),
            }])),
        });
    }

    // Public liveness probe — described separately because it's mounted manually
    // outside the file-routed `serveApi` folder.
    registry.registerPath({
        method:      "get",
        path:        "/health",
        summary:     "Public liveness probe",
        description: "Returns 200 if the hub process is up. Does NOT cross the network to any data-provider.",
        operationId: "health",
        tags:        ["health"],
        responses: {
            200: { description: "Process up", content: { "application/json": { schema: z.object({ ok: z.literal(true), status: z.literal("alive") }) } } },
        },
    });

    const generator = new OpenApiGeneratorV3(registry.definitions);
    const document  = generator.generateDocument({
        openapi: "3.0.0",
        info:    { title: "Bernouy Hub API", version: VERSION, description: "Tenant orchestration API. Authenticate with a Keycloak service-account JWT in the configured api-auth realm." },
        servers: [{ url: "https://hub.bernouy.com", description: "production" }],
    });

    document.components = {
        ...(document.components ?? {}),
        securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
    };

    writeFileSync(OUT_PATH, JSON.stringify(document, null, 2) + "\n", "utf8");
    console.log(`✓ wrote ${relative(process.cwd(), OUT_PATH)} (${endpoints.length} endpoints + 1 public probe)`);
}

async function collectEndpoints(): Promise<EndpointFile[]> {
    const out: EndpointFile[] = [];
    for await (const file of new Bun.Glob("**/*.ts").scan({ cwd: API_DIR })) {
        const parts = file.replace(/\.ts$/, "").split(".");
        if (parts.length < 2) continue;

        const rawMethod = parts.pop()!.toLowerCase() as HttpMethod;
        if (!HTTP_METHODS.includes(rawMethod)) continue;

        const namePart = parts.join(".");
        const route = deriveRoute(namePart);

        const mod = await import(join(API_DIR, file));
        const meta = (mod as { meta?: ApiOperationMeta }).meta;
        if (!meta) {
            console.warn(`! skipping ${file} — no \`meta\` export`);
            continue;
        }
        out.push({ method: rawMethod, route, meta });
    }
    return out;
}

/** Mirrors `serveApi`'s deriveRoute — when the basename matches the parent dir, route = dir.
 *  Otherwise route = full namePart. So `tenants/tenants` → `tenants`, `tenants/list` → `tenants/list`. */
function deriveRoute(namePart: string): string {
    const dir  = dirname(namePart);
    const name = basename(namePart);
    if (dir === ".")               return name;
    if (name === basename(dir))    return dir;
    return namePart;
}

await main();
