import { describe, expect, test } from "bun:test";
import { InMemoryCache } from "@bernouy/http-runner";
import type KernelCms from "cms-kernel/KernelCms";
import { resolveSvgSources } from "cms-kernel/html/resolveSvgSources";

const SVG = '<svg viewBox="0 0 24 24"><path d="M0 0"></path></svg>';

describe("resolveSvgSources", () => {
    test("loads one anonymous immutable capability response and caches it by URL", async () => {
        let calls = 0;
        const kernel = fixture(async (request) => {
            calls += 1;
            expect(new URL(request.url).pathname).toBe("/.cms/call/media/icon/check");
            expect(request.headers.get("authorization")).toBeNull();
            return svgResponse(SVG);
        });

        const source = "/.cms/call/media/icon/check";
        const [first, second] = await Promise.all([
            resolveSvgSources(kernel, [source]),
            resolveSvgSources(kernel, [source]),
        ]);

        expect(new TextDecoder().decode(first.get(source))).toBe(SVG);
        expect(second.get(source)).toEqual(first.get(source));
        expect(calls).toBe(1);
    });

    test("resolves all collection SVG metadata in one batch", async () => {
        const sources = ["{{ cms.asset.atlas.icons/check.svg }}", "{{ cms.asset.atlas.icons/close.svg }}"];
        const metadataCalls: unknown[][] = [];
        const assetRequests: string[] = [];
        const kernel = {
            basePath: "",
            cache: new InMemoryCache(),
            collectionAssets: {
                siteId: "site",
                store: {
                    getInstalledAssetMetadata: async () => null,
                    getInstalledAssetMetadataBatch: async (_siteId: string, references: unknown[]) => {
                        metadataCalls.push(references);
                        return ["check.svg", "close.svg"].map((name) => ({
                            collectionId: "atlas",
                            digest: `sha256:${"0".repeat(64)}`,
                            asset: {
                                id: `icons/${name}`,
                                mediaType: "image/svg+xml",
                                byteLength: new TextEncoder().encode(SVG).byteLength,
                                digest: `sha256:${"1".repeat(64)}`,
                                profiles: ["inline-svg"],
                            },
                        }));
                    },
                    getReleaseAsset: async () => null,
                },
            },
            collectionAssetHandler: async (request: Request) => {
                assetRequests.push(new URL(request.url).pathname);
                return svgResponse(SVG);
            },
            capabilityGateway: undefined,
        } as unknown as KernelCms;

        const resolved = await resolveSvgSources(kernel, sources);

        expect(metadataCalls).toHaveLength(1);
        expect(metadataCalls[0]).toEqual([
            { collectionId: "atlas", assetId: "icons/check.svg" },
            { collectionId: "atlas", assetId: "icons/close.svg" },
        ]);
        expect(assetRequests).toHaveLength(2);
        expect([...resolved.keys()]).toEqual(sources);
    });

    test.each([
        [
            new Headers({ "content-type": "text/plain", etag: '"v1"', "cache-control": "public, immutable" }),
            "text/plain",
        ],
        [
            new Headers({ "content-type": "image/svg+xml", etag: 'W/"v1"', "cache-control": "public, immutable" }),
            "strong ETag",
        ],
        [new Headers({ "content-type": "image/svg+xml", etag: '"v1"', "cache-control": "public" }), "immutable"],
        [
            new Headers({
                "content-type": "image/svg+xml",
                etag: '"v1"',
                "cache-control": "public, immutable",
                "content-length": String(64 * 1024 + 1),
            }),
            "byte budget",
        ],
    ])("rejects capability responses outside the immutable SVG contract", async (headers, issue) => {
        const kernel = fixture(async () => new Response(SVG, { headers }));

        await expect(resolveSvgSources(kernel, ["/.cms/call/media/icon/check"])).rejects.toThrow(issue);
    });
});

function fixture(capabilityHandler: (request: Request) => Promise<Response>): KernelCms {
    return {
        basePath: "",
        cache: new InMemoryCache(),
        capabilityHandler,
        capabilityGateway: undefined,
        collectionAssetHandler: undefined,
        collectionAssets: undefined,
    } as unknown as KernelCms;
}

function svgResponse(source: string): Response {
    return new Response(source, {
        headers: {
            "cache-control": "public, max-age=31536000, immutable",
            "content-length": String(new TextEncoder().encode(source).byteLength),
            "content-type": "image/svg+xml",
            etag: '"sha256:test"',
        },
    });
}
