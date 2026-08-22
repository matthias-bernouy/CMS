import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pullIntegrations } from "cms-cli/push/integrations/pull";
import { scanIntegrations } from "cms-cli/push/integrations/scan";
import { encode, withFetch } from "../fixtures";

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
