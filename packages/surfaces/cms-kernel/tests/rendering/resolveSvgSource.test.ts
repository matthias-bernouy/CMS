import { describe, expect, test } from "bun:test";
import { InMemoryCache } from "@bernouy/http-runner";
import type KernelCms from "cms-kernel/KernelCms";
import { resolveSvgSource } from "cms-kernel/html/resolveSvgSource";

const SVG = '<svg viewBox="0 0 24 24"><path d="M0 0"></path></svg>';

describe("resolveSvgSource", () => {
    test("loads one anonymous immutable capability response and caches it by URL", async () => {
        let calls = 0;
        const kernel = fixture(async (request) => {
            calls += 1;
            expect(new URL(request.url).pathname).toBe("/.cms/call/media/icon/check");
            expect(request.headers.get("authorization")).toBeNull();
            return svgResponse(SVG);
        });

        const [first, second] = await Promise.all([
            resolveSvgSource(kernel, "/.cms/call/media/icon/check"),
            resolveSvgSource(kernel, "/.cms/call/media/icon/check"),
        ]);

        expect(new TextDecoder().decode(first)).toBe(SVG);
        expect(second).toEqual(first);
        expect(calls).toBe(1);
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

        await expect(resolveSvgSource(kernel, "/.cms/call/media/icon/check")).rejects.toThrow(issue);
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
