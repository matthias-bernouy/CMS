import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pullBlocs } from "cms-cli/push/blocs/pull";
import { pullIntegrations, reconstructSource } from "cms-cli/push/integrations/pull";
import { scanIntegrations } from "cms-cli/push/integrations/scan";
import { encode, withFetch } from "./fixtures";

describe("reconstructSource (pull)", () => {
    test("rebuilds endpoint urns from id + endpointId and re-nests param type into schema", () => {
        const source = reconstructSource({
            urn: "urn:test",
            id: "test",
            meta: { name: "Test Source", description: "Test data", icon: "database" },
            endpoints: [
                {
                    endpointId: "list",
                    method: "GET",
                    targetUrl: "https://api.example.com/items",
                    params: [
                        { name: "q", in: "query", type: "string", required: true, description: "Search query" },
                        { name: "limit", in: "query", type: "number", required: false },
                    ],
                    output: [{ status: "200" }],
                },
            ],
        });

        expect(source.urn).toBe("urn:test");
        expect(source.meta?.name).toBe("Test Source");
        expect(source.endpoints[0]?.urn).toBe("urn:test:list");
        expect(source.endpoints[0]?.method).toBe("GET");
        expect(source.endpoints[0]?.input?.params?.[0]).toEqual({
            name: "q",
            in: "query",
            required: true,
            description: "Search query",
            schema: { type: "string" },
        });
        expect(source.endpoints[0]?.input?.params?.[1]).toEqual({
            name: "limit",
            in: "query",
            schema: { type: "number" },
        });
        expect(source.endpoints[0]?.output).toEqual([{ status: "200" }]);
    });
});

describe("pullIntegrations", () => {
    test("writes generated bloc artifacts under .p9r/generated/blocs", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-int-pull-"));
        const blocSource = {
            "manifest.json": encode(
                JSON.stringify({
                    "default-tag": "demo-card",
                    bloc: "./Bloc.ts",
                    meta: { title: "Demo card" },
                }),
            ),
            "Bloc.ts": encode("export class DemoCard extends HTMLElement {}\n"),
        };

        await withFetch(
            async (url) => {
                if (url.endsWith("/api/integrations/installations")) {
                    return Response.json([{ id: "demo" }]);
                }
                if (url.includes("/api/integrations/installations?id=demo")) {
                    return Response.json(demoDetail());
                }
                if (url.endsWith("/api/bloc/list")) {
                    return Response.json([
                        {
                            id: "demo-card",
                            group: "Generated",
                            ownership: {
                                kind: "integration",
                                integrationKind: "demo",
                                installationId: "demo",
                                definitionVersion: "1",
                            },
                        },
                    ]);
                }
                if (url.includes("/api/bloc/source?tag=demo-card")) {
                    return Response.json({ source: blocSource });
                }
                return new Response("not found", { status: 404 });
            },
            async () => {
                const result = await pullIntegrations(new URL("http://cms.test/"), "token", siteDir);

                expect(result).toEqual({ pulled: ["demo"], failed: [] });
                expect(JSON.parse(readFileSync(join(siteDir, "integrations", "demo.json"), "utf-8"))).toMatchObject({
                    kind: "demo",
                    version: "1.0.0",
                    answers: { id: "main" },
                });
                expect(
                    readFileSync(
                        join(siteDir, ".p9r", "generated", "blocs", "Generated", "demo-card", "manifest.json"),
                        "utf-8",
                    ),
                ).toContain(`"default-tag":"demo-card"`);
            },
        );
    });

    test("keeps an unversioned legacy installation pushable after pull", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-int-pull-legacy-"));

        await withFetch(
            async (url) => {
                if (url.endsWith("/api/integrations/installations")) {
                    return Response.json([{ id: "demo" }]);
                }
                if (url.includes("/api/integrations/installations?id=demo")) {
                    return Response.json({ ...demoDetail(), definitionVersion: "unversioned", artifacts: [] });
                }
                return new Response("not found", { status: 404 });
            },
            async () => {
                expect(await pullIntegrations(new URL("http://cms.test/"), "token", siteDir)).toEqual({
                    pulled: ["demo"],
                    failed: [],
                });

                const serialized = JSON.parse(readFileSync(join(siteDir, "integrations", "demo.json"), "utf-8"));
                expect(serialized.version).toBeUndefined();
                expect((await scanIntegrations(siteDir))[0]?.request).toMatchObject({
                    kind: "demo",
                    answers: { id: "main" },
                });
            },
        );
    });
});

describe("pullBlocs", () => {
    test("rejects a traversal tag without replacing the existing bloc tree", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-bloc-pull-"));
        const marker = join(siteDir, "blocs", "Keep", "safe-card", "marker.txt");
        mkdirSync(join(siteDir, "blocs", "Keep", "safe-card"), { recursive: true });
        writeFileSync(marker, "keep");

        await withFetch(
            async (url) =>
                url.endsWith("/api/bloc/list")
                    ? Response.json([{ id: "..", group: "Generated", ownership: { kind: "code-managed" } }])
                    : new Response("source must not be fetched", { status: 500 }),
            async () => {
                const result = await pullBlocs(new URL("http://cms.test/"), "token", siteDir);

                expect(result.pulled).toEqual([]);
                expect(result.failed[0]?.error).toContain("Invalid remote bloc tag");
                expect(readFileSync(marker, "utf-8")).toBe("keep");
            },
        );
    });

    test("skips blocs already owned by generated integration artifacts", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-bloc-pull-"));
        mkdirSync(join(siteDir, ".p9r", "generated"), { recursive: true });
        writeFileSync(
            join(siteDir, ".p9r", "generated", "integration-installations.json"),
            JSON.stringify([
                {
                    id: "demo",
                    artifacts: [{ type: "bloc", id: "demo-card", action: "created" }],
                },
            ]),
        );

        await withFetch(
            async (url) => {
                if (url.endsWith("/api/bloc/list")) {
                    return Response.json([
                        { id: "demo-card", group: "Generated", ownership: { kind: "code-managed" } },
                    ]);
                }
                if (url.includes("/api/bloc/source")) {
                    throw new Error("generated bloc source should not be fetched by pullBlocs");
                }
                return new Response("not found", { status: 404 });
            },
            async () => {
                const result = await pullBlocs(new URL("http://cms.test/"), "token", siteDir);

                expect(result.pulled).toEqual([]);
                expect(result.failed).toEqual([]);
                expect(result.skipped).toEqual([
                    {
                        tag: "demo-card",
                        reason: "generated by an integration; use `p9r pull --type=integrations`",
                    },
                ]);
            },
        );
    });
});

function demoDetail(): Record<string, unknown> {
    return {
        id: "demo",
        label: "Demo",
        definitionVersion: "1.0.0",
        status: "success",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        runCount: 1,
        answers: { id: "main" },
        artifacts: [{ type: "bloc", id: "demo-card", action: "created" }],
        runs: [],
    };
}
