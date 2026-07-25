import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SourceEndpoint } from "@bernouy/cms-sources";
import {
    createLocalSourceImageComposition,
    localSourceImageCachePath,
} from "../../src/dev-server/runtime/sourceImages";

const roots: string[] = [];
const IMAGE_ENDPOINT: SourceEndpoint = {
    urn: "urn:photos:image",
    method: "GET",
    targetUrl: "https://images.test/original",
    access: { mode: "public" },
    responseKind: "file",
    mediaType: "image/*",
    output: [{ status: "200" }],
};
const PNG = Uint8Array.from(
    Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
    ),
);

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("local Source image composition", () => {
    test("uses a site-local hidden cache and transforms through Sharp", async () => {
        const siteDir = await temporarySite();
        const composition = await createLocalSourceImageComposition({
            siteDir,
            scope: "http://localhost:5001",
            enabled: true,
        });
        const next = mock(
            async () =>
                new Response(PNG.slice().buffer, {
                    headers: {
                        "content-type": "image/png",
                        "cache-control": "public, max-age=3600",
                    },
                }),
        );
        const request = new Request("http://localhost:5001/.cms/sources/photos/image?cms-width=64");

        const first = await composition.sourceImageInterceptor(IMAGE_ENDPOINT, request, next);
        const second = await composition.sourceImageInterceptor(IMAGE_ENDPOINT, request, next);

        expect(composition.responsivePublicSourceImagesEnabled).toBe(true);
        expect(composition.responsivePrivateSourceImagesEnabled).toBe(true);
        expect(first.headers.get("content-type")).toBe("image/webp");
        expect(second.headers.get("content-type")).toBe("image/webp");
        expect(next).toHaveBeenCalledTimes(1);
        expect(localSourceImageCachePath(siteDir)).toBe(join(siteDir, ".cms-variants", "source-images"));
        expect(
            await Array.fromAsync(new Bun.Glob("objects/**/*").scan(localSourceImageCachePath(siteDir))),
        ).not.toEqual([]);
        await composition.dispose();
    });

    test("fails closed for reserved transforms when explicitly disabled", async () => {
        const siteDir = await temporarySite();
        const composition = await createLocalSourceImageComposition({
            siteDir,
            scope: "http://localhost:5001",
            enabled: false,
        });
        const next = mock(async () => new Response(PNG.slice().buffer));

        const response = await composition.sourceImageInterceptor(
            IMAGE_ENDPOINT,
            new Request("http://localhost:5001/.cms/sources/photos/image?cms-width=64"),
            next,
        );

        expect(response.status).toBe(503);
        expect(next).not.toHaveBeenCalled();
        expect(composition.responsivePublicSourceImagesEnabled).toBe(false);
        expect(composition.responsivePrivateSourceImagesEnabled).toBe(false);
    });
});

async function temporarySite(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "p9r-source-images-"));
    roots.push(root);
    return root;
}
