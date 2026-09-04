import { INTEGRATION_PACKAGE_DIGEST_HEADER } from "@bernouy/cms-integration-packages";
import type { LocalRepositoryCatalog } from "./catalog";
import type { LocalIntegrationRepository } from "./local";

const BASE_PATH = "/.cms/repository";

export type LocalRepositoryServer = Readonly<{
    url: string;
    stop(): void;
}>;

export function startLocalRepositoryServer(
    repository: LocalIntegrationRepository,
    catalog: LocalRepositoryCatalog,
    port: number,
): LocalRepositoryServer {
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port,
        fetch: (request) => handleRepositoryRequest(request, repository, catalog),
    });
    return {
        url: `http://127.0.0.1:${server.port}${BASE_PATH}`,
        stop: () => server.stop(true),
    };
}

export async function handleRepositoryRequest(
    request: Request,
    repository: LocalIntegrationRepository,
    catalog: LocalRepositoryCatalog,
): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${BASE_PATH}/api/integrations`)) {
        return json({ error: "not found" }, 404);
    }
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: commonHeaders() });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
        return json({ error: "method not allowed" }, 405);
    }
    try {
        const response = await integrationResponse(url, repository, catalog);
        return request.method === "HEAD" ? withoutBody(response) : response;
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : "local repository failure" }, 500);
    }
}

async function integrationResponse(
    url: URL,
    repository: LocalIntegrationRepository,
    catalog: LocalRepositoryCatalog,
): Promise<Response> {
    const route = url.pathname.slice(BASE_PATH.length);
    if (route === "/api/integrations") {
        return json(await catalog.list());
    }
    const kind = url.searchParams.get("kind")?.trim();
    if (!kind) {
        return json({ error: "kind is required" }, 400);
    }
    if (route === "/api/integrations/index") {
        return nullableJson(await catalog.index(kind));
    }
    if (route === "/api/integrations/versions") {
        const index = await catalog.index(kind);
        return index ? json(index.versions) : json({ error: "not found" }, 404);
    }
    const version = url.searchParams.get("version")?.trim() || undefined;
    const record = await catalog.record(kind, version);
    if (!record) {
        return json({ error: "not found" }, 404);
    }
    if (route === "/api/integrations/definition") {
        return json(await repository.getDefinition(record));
    }
    if (route === "/api/integrations/package") {
        const resolved = await repository.getPackage(record);
        return new Response(Uint8Array.from(resolved.canonicalBytes).buffer, {
            headers: {
                ...commonHeaders(),
                "content-length": String(resolved.canonicalBytes.byteLength),
                "content-type": "application/json",
                [INTEGRATION_PACKAGE_DIGEST_HEADER]: resolved.digest,
            },
        });
    }
    if (route === "/api/integrations/asset") {
        const path = url.searchParams.get("path")?.trim();
        if (!path) {
            return json({ error: "path is required" }, 400);
        }
        const asset = await catalog.asset(record, path);
        return asset
            ? new Response(Uint8Array.from(asset.bytes).buffer, {
                  headers: { ...commonHeaders(), "content-type": asset.contentType },
              })
            : json({ error: "not found" }, 404);
    }
    return json({ error: "not found" }, 404);
}

function nullableJson(value: unknown): Response {
    return value === null ? json({ error: "not found" }, 404) : json(value);
}

function json(value: unknown, status = 200): Response {
    return Response.json(value, { status, headers: commonHeaders() });
}

function commonHeaders(): Record<string, string> {
    return {
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
    };
}

function withoutBody(response: Response): Response {
    return new Response(null, { status: response.status, headers: response.headers });
}
