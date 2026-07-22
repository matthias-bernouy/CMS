import { describe, expect, test } from "bun:test";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import { definition, repositoryWithAsset, sourceArtifact } from "./httpRepositoryFixtures";

describe("HTTP integration icon assets", () => {
    test("hydrates raw remote asset references with the definition version", async () => {
        const calls: string[] = [];
        const repository = new HttpIntegrationDefinitionRepository({
            baseUrl: "https://repo.example.test",
            fetch: async (input) => {
                const url = input instanceof URL ? input : new URL(String(input));
                calls.push(`${url.pathname}${url.search}`);
                if (url.pathname.endsWith("/definition")) {
                    return Response.json(definition());
                }
                if (url.pathname.endsWith("/asset")) {
                    return new Response('<svg viewBox="0 0 24 24"></svg>', {
                        headers: { "content-type": "image/svg+xml; charset=utf-8" },
                    });
                }
                return Response.json({}, { status: 404 });
            },
        });

        const loaded = await repository.get("remote-icons");
        const artifact = loaded?.artifacts?.[0];

        expect(artifact?.type === "source" ? artifact.source.meta.svg : null).toContain("<svg");
        expect(calls).toEqual([
            "/api/integrations/definition?kind=remote-icons",
            "/api/integrations/asset?kind=remote-icons&path=assets%2Fsource.svg&version=2.1.0",
        ]);
    });

    test("does not fetch an asset already embedded by the remote repository", async () => {
        let assetCalls = 0;
        const repository = new HttpIntegrationDefinitionRepository({
            baseUrl: "https://repo.example.test",
            fetch: async (input) => {
                const url = input instanceof URL ? input : new URL(String(input));
                if (url.pathname.endsWith("/asset")) {
                    assetCalls += 1;
                }
                return Response.json(definition('<svg viewBox="0 0 24 24"></svg>'));
            },
        });

        const loaded = await repository.get("remote-icons");

        expect(loaded?.artifacts?.[0]).toMatchObject({
            type: "source",
            source: { meta: { icon: "assets/source.svg", svg: expect.stringContaining("<svg") } },
        });
        expect(assetCalls).toBe(0);
    });

    test("stops reading a streamed icon response at the byte limit", async () => {
        let cancelled = false;
        let chunksRead = 0;
        const repository = repositoryWithAsset(
            () =>
                new Response(
                    new ReadableStream({
                        pull(controller) {
                            chunksRead += 1;
                            controller.enqueue(new Uint8Array(10_000).fill(120));
                            if (chunksRead === 10) {
                                controller.close();
                            }
                        },
                        cancel() {
                            cancelled = true;
                        },
                    }),
                    { headers: { "content-type": "image/svg+xml" } },
                ),
        );

        await expect(repository.get("remote-icons")).rejects.toThrow(/exceeds 32000 bytes/);
        expect(chunksRead).toBeLessThan(10);
        expect(cancelled).toBe(true);
    });

    test("rejects an oversized content length before decoding the icon", async () => {
        const repository = repositoryWithAsset(
            () =>
                new Response("<svg></svg>", {
                    headers: {
                        "content-length": "32001",
                        "content-type": "image/svg+xml",
                    },
                }),
        );

        await expect(repository.get("remote-icons")).rejects.toThrow(/exceeds 32000 bytes/);
    });

    test("rejects remote icons without an SVG content type", async () => {
        const repository = repositoryWithAsset(() => new Response("<svg></svg>"));

        await expect(repository.get("remote-icons")).rejects.toThrow(/must have an SVG content type/);
    });

    test("keeps explicit asset reads unbounded", async () => {
        const repository = repositoryWithAsset(() => new Response("x".repeat(32_001)));

        const asset = await repository.getAsset("remote-icons", "2.1.0", "assets/archive.bin");

        expect(asset?.bytes.byteLength).toBe(32_001);
    });

    test("rejects mismatched definition identity before fetching icons", async () => {
        let assetCalls = 0;
        const wrongKind = { ...definition(), kind: "other" };
        const repository = repositoryWithAsset(() => {
            assetCalls += 1;
            return new Response("<svg></svg>");
        }, wrongKind);

        await expect(repository.get("remote-icons")).rejects.toThrow(/returned kind/);
        expect(assetCalls).toBe(0);

        const repositoryWithWrongVersion = repositoryWithAsset(() => {
            assetCalls += 1;
            return new Response("<svg></svg>");
        });
        await expect(repositoryWithWrongVersion.get("remote-icons", "1.0.0")).rejects.toThrow(/returned version/);
        expect(assetCalls).toBe(0);
    });

    test("loads distinct icon assets sequentially", async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        const multipleIcons = {
            ...definition(),
            artifacts: [sourceArtifact("first", "assets/first.svg"), sourceArtifact("second", "assets/second.svg")],
        };
        const repository = repositoryWithAsset(async () => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            inFlight -= 1;
            return new Response("<svg></svg>", { headers: { "content-type": "image/svg+xml" } });
        }, multipleIcons);

        await repository.get("remote-icons");

        expect(maxInFlight).toBe(1);
    });
});
