import type { SQL } from "bun";
import { executeCurrentMediaRpc } from "./database";
import type { LegacyCommerceHandler } from "./legacyArtifact";

export type LegacyEdgeCall = {
    body: Record<string, unknown>;
    method: string;
    resource: string;
    url: string;
};

export function installLegacyEdgeHarness(
    database: SQL,
    handler: LegacyCommerceHandler,
    initialStoragePaths: string[],
): {
    calls: LegacyEdgeCall[];
    close: () => void;
    request: (
        path: string,
        options: { formData?: FormData; method?: string; userId?: string; admin?: boolean },
    ) => Promise<Response>;
    storagePaths: Set<string>;
} {
    const originalFetch = globalThis.fetch;
    const originalDeno = (globalThis as { Deno?: unknown }).Deno;
    const calls: LegacyEdgeCall[] = [];
    const storagePaths = new Set(initialStoragePaths);

    (globalThis as { Deno?: { env: { get: (name: string) => string | undefined } } }).Deno = {
        env: {
            get(name) {
                return {
                    CMS_COMMERCE_API_KEY: "legacy-commerce-key",
                    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_rollout" }),
                    SUPABASE_URL: "https://rollout.supabase.test",
                }[name];
            },
        },
    };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        const resource = url.pathname.split("/").at(-1) ?? "";
        const body = request.headers.get("content-type")?.includes("application/json")
            ? ((await request.clone().json()) as Record<string, unknown>)
            : {};
        calls.push({ body, method: request.method, resource, url: request.url });
        if (url.pathname.startsWith("/rest/v1/rpc/")) {
            return Response.json(await executeCurrentMediaRpc(database, resource, body));
        }
        if (url.pathname.startsWith("/storage/v1/object/commerce-media/")) {
            const path = storagePath(url);
            if (request.method === "POST") {
                storagePaths.add(path);
            }
            if (request.method === "DELETE") {
                storagePaths.delete(path);
            }
            return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected legacy Edge request ${request.method} ${request.url}`);
    }) as typeof fetch;

    return {
        calls,
        storagePaths,
        request(path, options) {
            const headers = new Headers({ authorization: "Bearer legacy-commerce-key" });
            if (options.admin) {
                headers.set("x-cms-user-role", "admin");
            }
            if (options.userId) {
                headers.set("x-cms-user-id", options.userId);
            }
            return handler(
                new Request(`https://cms.test/functions/v1/cms-commerce${path}`, {
                    method: options.method ?? (options.formData ? "POST" : "GET"),
                    headers,
                    body: options.formData,
                }),
            );
        },
        close() {
            globalThis.fetch = originalFetch;
            (globalThis as { Deno?: unknown }).Deno = originalDeno;
        },
    };
}

function storagePath(url: URL): string {
    const marker = "/storage/v1/object/commerce-media/";
    return url.pathname
        .slice(marker.length)
        .split("/")
        .map((part) => decodeURIComponent(part))
        .join("/");
}
