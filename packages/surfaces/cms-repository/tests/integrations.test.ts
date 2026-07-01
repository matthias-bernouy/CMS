import { describe, expect, test } from "bun:test";
import type { RouteHandler, Runner } from "@bernouy/http-runner";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import { RepositoryCms } from "cms-repository/RepositoryCms";

describe("@bernouy/cms-repository integration routes", () => {
    test("publishes integration catalogue definitions", async () => {
        const runner = new TestRunner();
        new RepositoryCms({
            runner,
            integrationCatalog: testCatalog(),
        });

        const list = await json(await runner.handle("/api/integrations"));
        expect(list).toEqual([{
            kind: "demo",
            label: "Demo",
            stable: "1.0.0",
            latest: "1.0.0",
            versions: ["1.0.0"],
        }]);

        const definition = await json(await runner.handle("/api/integrations/definition?kind=demo"));
        expect(definition.kind).toBe("demo");
        expect(definition.version).toBe("1.0.0");
    });

    test("returns 404 for unknown definitions", async () => {
        const runner = new TestRunner();
        new RepositoryCms({
            runner,
            integrationCatalog: testCatalog(),
        });

        const response = await runner.handle("/api/integrations/definition?kind=missing");

        expect(response.status).toBe(404);
        expect(await json(response)).toEqual({ error: "integration definition not found" });
    });
});

class TestRunner implements Partial<Runner> {
    readonly basePath = "/";
    private readonly routes = new Map<string, RouteHandler>();

    get(path: string, handler: RouteHandler): void {
        this.routes.set(`GET ${path}`, handler);
    }

    async handle(path: string): Promise<Response> {
        const pathname = new URL(path, "http://localhost").pathname;
        const handler = this.routes.get(`GET ${pathname}`);
        if (!handler) throw new Error(`missing handler for ${pathname}`);
        return handler(new Request(`http://localhost${path}`)) as Promise<Response>;
    }
}

function testCatalog(): IntegrationDefinitionRepository {
    return {
        list: async () => [{
            kind: "demo",
            label: "Demo",
            stable: "1.0.0",
            latest: "1.0.0",
            versions: ["1.0.0"],
        }],
        getIndex: async kind => kind === "demo" ? {
            kind: "demo",
            label: "Demo",
            stable: "1.0.0",
            latest: "1.0.0",
            versions: [{ version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" }],
        } : null,
        listVersions: async () => [{ version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" }],
        get: async kind => kind === "demo" ? {
            kind: "demo",
            label: "Demo",
            version: "1.0.0",
            inputs: [],
        } : null,
    };
}

async function json(response: Response): Promise<any> {
    return response.json();
}
