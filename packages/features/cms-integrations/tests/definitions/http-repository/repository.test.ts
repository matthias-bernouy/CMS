import { describe, expect, test } from "bun:test";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";

describe("HttpIntegrationDefinitionRepository", () => {
    test("reads integration summaries and definitions from repository HTTP routes", async () => {
        const verificationDigest = "a".repeat(64);
        const calls: string[] = [];
        const repo = new HttpIntegrationDefinitionRepository({
            baseUrl: "https://repo.example.com/base",
            fetch: async (input) => {
                const url = input instanceof URL ? input : new URL(String(input));
                calls.push(`${url.pathname}${url.search}`);
                if (url.pathname === "/base/api/integrations") {
                    return json([
                        {
                            kind: "demo",
                            label: "Demo",
                            icon: { path: "assets/icon.svg" },
                            versions: ["1.0.0"],
                            stable: "1.0.0",
                        },
                    ]);
                }
                if (url.pathname === "/base/api/integrations/definition") {
                    return json({
                        kind: "demo",
                        label: "Demo",
                        version: "1.0.0",
                        icon: { path: "assets/icon.svg" },
                        inputs: [],
                    });
                }
                if (url.pathname === "/base/api/integrations/index") {
                    return json({
                        kind: "demo",
                        label: "Demo",
                        icon: { path: "assets/icon.svg" },
                        stable: "1.0.0",
                        versions: [
                            {
                                version: "1.0.0",
                                path: "versions/1.0.0",
                                definition: "versions/1.0.0/definition.json",
                                verificationDigest,
                                status: "blocked",
                            },
                        ],
                    });
                }
                if (url.pathname === "/base/api/integrations/versions") {
                    return json([
                        {
                            version: "1.0.0",
                            path: "versions/1.0.0",
                            definition: "versions/1.0.0/definition.json",
                            verificationDigest,
                        },
                    ]);
                }
                if (url.pathname === "/base/api/integrations/asset") {
                    return new Response("<svg></svg>", { headers: { "content-type": "image/svg+xml; charset=utf-8" } });
                }
                return json({ error: "not found" }, 404);
            },
        });

        expect(await repo.list()).toEqual([
            { kind: "demo", label: "Demo", icon: { path: "assets/icon.svg" }, versions: ["1.0.0"], stable: "1.0.0" },
        ]);
        expect(await repo.get("demo", "1.0.0")).toEqual({
            kind: "demo",
            label: "Demo",
            version: "1.0.0",
            icon: { path: "assets/icon.svg" },
            inputs: [],
        });
        expect(await repo.getIndex("demo")).toEqual({
            kind: "demo",
            label: "Demo",
            icon: { path: "assets/icon.svg" },
            stable: "1.0.0",
            versions: [
                {
                    version: "1.0.0",
                    path: "versions/1.0.0",
                    definition: "versions/1.0.0/definition.json",
                    verificationDigest,
                    status: "blocked",
                },
            ],
        });
        expect(await repo.listVersions("demo")).toEqual([
            {
                version: "1.0.0",
                path: "versions/1.0.0",
                definition: "versions/1.0.0/definition.json",
                verificationDigest,
            },
        ]);
        const asset = await repo.getAsset("demo", "1.0.0", "assets/icon.svg");
        expect(asset?.contentType).toBe("image/svg+xml; charset=utf-8");
        expect(new TextDecoder().decode(asset?.bytes)).toBe("<svg></svg>");
        expect(calls).toEqual([
            "/base/api/integrations",
            "/base/api/integrations/definition?kind=demo&version=1.0.0",
            "/base/api/integrations/index?kind=demo",
            "/base/api/integrations/versions?kind=demo",
            "/base/api/integrations/asset?kind=demo&path=assets%2Ficon.svg&version=1.0.0",
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
