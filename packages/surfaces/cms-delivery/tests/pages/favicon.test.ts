import { describe, expect, test } from "bun:test";
import type { ContentReader, TSystem } from "@bernouy/cms-content";
import { InMemoryCmsFilesBlob, InMemoryCmsFilesMetadata } from "@bernouy/cms-files";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { DEFAULT_FAVICON_SVG } from "cms-delivery/core/assets/defaultFavicon";
import { CaptureRunner } from "../gateway/support/CaptureRunner";

describe("Delivery stable favicon", () => {
    test("serves the configured CMS file with stable revalidation", async () => {
        const bytes = new Uint8Array([137, 80, 78, 71]);
        const mounted = await mountFavicon("/.cms/files/by-id/favicon-id", {
            id: "favicon-id",
            bytes,
            contentHash: "abc123",
            mimeType: "image/vnd.microsoft.icon",
        });

        const response = await mounted.request("GET");
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/vnd.microsoft.icon");
        expect(response.headers.get("cache-control")).toBe("no-cache, must-revalidate");
        expect(response.headers.get("etag")).toBe('"abc123"');
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);

        const revalidated = await mounted.request("GET", { "If-None-Match": '"abc123"' });
        expect(revalidated.status).toBe(304);
        expect(await revalidated.text()).toBe("");
    });

    test("serves the default when no configured CMS file resolves", async () => {
        const mounted = await mountFavicon("/.cms/files/by-id/missing");
        const response = await mounted.request("GET");

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/svg+xml");
        expect(await response.text()).toBe(DEFAULT_FAVICON_SVG);
    });

    test("registers a bodyless HEAD response for the stable route", async () => {
        const bytes = new Uint8Array([1, 2, 3]);
        const mounted = await mountFavicon("/.cms/files/by-id/favicon-id", {
            id: "favicon-id",
            bytes,
            contentHash: "def456",
            mimeType: "image/x-icon",
        });
        const response = await mounted.request("HEAD");

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/x-icon");
        expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
        expect(await response.text()).toBe("");
    });
});

type Seed = {
    id: string;
    bytes: Uint8Array;
    contentHash: string;
    mimeType: string;
};

async function mountFavicon(favicon: string, seed?: Seed) {
    const runner = new CaptureRunner();
    const metadata = new InMemoryCmsFilesMetadata();
    const blob = new InMemoryCmsFilesBlob();
    if (seed) {
        await metadata.createFile({
            id: seed.id,
            name: "favicon.png",
            parentId: null,
            size: seed.bytes.byteLength,
            mimeType: seed.mimeType,
            contentHash: seed.contentHash,
        });
        await blob.put(seed.id, seed.bytes);
    }
    new DeliveryCms({
        runner,
        repository: {
            getSystem: async () => ({ site: { favicon } }) as TSystem,
        } as ContentReader,
        filesMetadata: metadata,
        filesBlob: blob,
    });
    return {
        request: (method: "GET" | "HEAD", headers?: HeadersInit) =>
            runner.endpointHandler(
                method,
                "/favicon.ico",
            )(new Request("https://example.test/favicon.ico", { method, headers })),
    };
}
