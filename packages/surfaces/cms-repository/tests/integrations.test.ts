import { describe, expect, test } from "bun:test";
import type { RouteHandler, Runner } from "@bernouy/http-runner";
import { IntegrationRepositoryUnavailableError, type IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import { RepositoryCms } from "cms-repository/RepositoryCms";

describe("@bernouy/cms-repository integration routes", () => {
    test("publishes integration catalogue definitions", async () => {
        const runner = new TestRunner();
        new RepositoryCms({
            runner,
            integrationCatalog: testCatalog(),
        });

        const listResponse = await runner.handle("/api/integrations");
        const list = await json(listResponse);
        expect(list).toEqual([
            {
                kind: "demo",
                label: "Demo",
                stable: "1.0.0",
                latest: "1.0.0",
                versions: ["1.0.0"],
            },
        ]);

        const definition = await json(await runner.handle("/api/integrations/definition?kind=demo"));
        expect(definition.kind).toBe("demo");
        expect(definition.version).toBe("1.0.0");
        expect(listResponse.headers.get("access-control-allow-origin")).toBe("*");
        expect(listResponse.headers.get("cache-control")).toBe("public, max-age=60");
        expect(listResponse.headers.get("etag")).toMatch(/^"[a-f0-9]{64}"$/);
    });

    test("returns 404 for unknown definitions", async () => {
        const runner = new TestRunner();
        new RepositoryCms({
            runner,
            integrationCatalog: testCatalog(),
        });

        const response = await runner.handle("/api/integrations/definition?kind=missing");

        expect(response.status).toBe(404);
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await json(response)).toEqual({ error: "integration definition not found" });
    });

    test("publishes integration assets", async () => {
        const runner = new TestRunner();
        new RepositoryCms({
            runner,
            integrationCatalog: testCatalog(),
        });

        const response = await runner.handle("/api/integrations/asset?kind=demo&version=1.0.0&path=assets/icon.svg");

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
        expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
        expect(await response.text()).toBe("<svg></svg>");
    });

    test("serves exact definitions with immutable HEAD and ETag revalidation", async () => {
        const runner = new TestRunner();
        new RepositoryCms({ runner, integrationCatalog: testCatalog() });
        const path = "/api/integrations/definition?kind=demo&version=1.0.0";

        const get = await runner.handle(path);
        const etag = get.headers.get("etag");
        const head = await runner.handle(path, { method: "HEAD" });
        const notModified = await runner.handle(path, {
            headers: { "if-none-match": `W/${etag}` },
        });

        expect(get.status).toBe(200);
        expect(get.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(head.status).toBe(200);
        expect(head.headers.get("etag")).toBe(etag);
        expect(await head.text()).toBe("");
        expect(notModified.status).toBe(304);
        expect(notModified.headers.get("etag")).toBe(etag);
        expect(await notModified.text()).toBe("");
    });

    test("publishes a cacheable CORS preflight contract", async () => {
        const runner = new TestRunner();
        new RepositoryCms({ runner, integrationCatalog: testCatalog() });

        const response = await runner.handle("/api/integrations/definition", { method: "OPTIONS" });

        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
        expect(response.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
        expect(response.headers.get("access-control-allow-headers")).toBe("If-None-Match");
    });

    test("keeps structured input and repository errors readable across origins", async () => {
        const runner = new TestRunner();
        const catalog = testCatalog();
        new RepositoryCms({
            runner,
            integrationCatalog: {
                ...catalog,
                list: async () => {
                    throw new IntegrationRepositoryUnavailableError();
                },
            },
        });

        const invalid = await runner.handle("/api/integrations/definition");
        const unavailable = await runner.handle("/api/integrations");

        expect(invalid.status).toBe(400);
        expect(invalid.headers.get("access-control-allow-origin")).toBe("*");
        expect(await invalid.json()).toEqual({ error: "Missing param kind" });
        expect(unavailable.status).toBe(503);
        expect(unavailable.headers.get("access-control-allow-origin")).toBe("*");
        expect(await unavailable.json()).toEqual({
            error: "Integration repository is unavailable",
            code: "integration_repository_unavailable",
        });
    });
});

class TestRunner implements Partial<Runner> {
    readonly basePath = "/";
    private readonly routes = new Map<string, RouteHandler>();

    get(path: string, handler: RouteHandler): void {
        this.addEndpoint("GET", path, handler);
    }

    addEndpoint(method: string, path: string, handler: RouteHandler): void {
        this.routes.set(`${method} ${path}`, handler);
    }

    async handle(path: string, init: RequestInit = {}): Promise<Response> {
        const pathname = new URL(path, "http://localhost").pathname;
        const method = init.method ?? "GET";
        const handler = this.routes.get(`${method} ${pathname}`);
        if (!handler) {
            throw new Error(`missing handler for ${method} ${pathname}`);
        }
        return handler(new Request(`http://localhost${path}`, init)) as Promise<Response>;
    }
}

function testCatalog(): IntegrationDefinitionRepository {
    return {
        list: async () => [
            {
                kind: "demo",
                label: "Demo",
                stable: "1.0.0",
                latest: "1.0.0",
                versions: ["1.0.0"],
            },
        ],
        getIndex: async (kind) =>
            kind === "demo"
                ? {
                      kind: "demo",
                      label: "Demo",
                      stable: "1.0.0",
                      latest: "1.0.0",
                      versions: [
                          { version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" },
                      ],
                  }
                : null,
        listVersions: async () => [
            { version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" },
        ],
        get: async (kind) =>
            kind === "demo"
                ? {
                      kind: "demo",
                      label: "Demo",
                      version: "1.0.0",
                      icon: { path: "assets/icon.svg" },
                      inputs: [],
                  }
                : null,
        getAsset: async (kind, version, path) =>
            kind === "demo" && version === "1.0.0" && path === "assets/icon.svg"
                ? { bytes: new TextEncoder().encode("<svg></svg>"), contentType: "image/svg+xml; charset=utf-8" }
                : null,
    };
}

async function json(response: Response): Promise<any> {
    return response.json();
}
