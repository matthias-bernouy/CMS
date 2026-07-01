import { describe, expect, test } from "bun:test";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";

describe("HttpIntegrationDefinitionRepository", () => {
    test("reads integration summaries and definitions from repository HTTP routes", async () => {
        const calls: string[] = [];
        const repo = new HttpIntegrationDefinitionRepository({
            baseUrl: "https://repo.example.com/base",
            fetch: async (input) => {
                const url = input instanceof URL ? input : new URL(String(input));
                calls.push(`${url.pathname}${url.search}`);
                if (url.pathname === "/api/integrations") {
                    return json([{ kind: "demo", label: "Demo", versions: ["1.0.0"], stable: "1.0.0" }]);
                }
                if (url.pathname === "/api/integrations/definition") {
                    return json({ kind: "demo", label: "Demo", version: "1.0.0", inputs: [] });
                }
                if (url.pathname === "/api/integrations/index") {
                    return json({
                        kind: "demo",
                        label: "Demo",
                        stable: "1.0.0",
                        versions: [{ version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" }],
                    });
                }
                if (url.pathname === "/api/integrations/versions") {
                    return json([{ version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" }]);
                }
                return json({ error: "not found" }, 404);
            },
        });

        expect(await repo.list()).toEqual([{ kind: "demo", label: "Demo", versions: ["1.0.0"], stable: "1.0.0" }]);
        expect(await repo.get("demo", "1.0.0")).toEqual({ kind: "demo", label: "Demo", version: "1.0.0", inputs: [] });
        expect(await repo.getIndex("demo")).toEqual({
            kind: "demo",
            label: "Demo",
            stable: "1.0.0",
            versions: [{ version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" }],
        });
        expect(await repo.listVersions("demo")).toEqual([
            { version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" },
        ]);
        expect(calls).toEqual([
            "/api/integrations",
            "/api/integrations/definition?kind=demo&version=1.0.0",
            "/api/integrations/index?kind=demo",
            "/api/integrations/versions?kind=demo",
        ]);
    });

    test("returns null for missing definitions", async () => {
        const repo = new HttpIntegrationDefinitionRepository({
            baseUrl: "https://repo.example.com",
            fetch: async () => json({ error: "missing" }, 404),
        });

        expect(await repo.get("missing")).toBeNull();
        expect(await repo.getIndex("missing")).toBeNull();
        expect(await repo.listVersions("missing")).toEqual([]);
    });
});

function json(body: unknown, status = 200): Response {
    return Response.json(body, { status });
}
