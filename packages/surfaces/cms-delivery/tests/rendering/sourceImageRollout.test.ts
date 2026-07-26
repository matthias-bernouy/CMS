import { describe, expect, mock, test } from "bun:test";
import type { ContentReader } from "@bernouy/cms-content";
import {
    createDisabledSourceImageInterceptor,
    createSourceImageInterceptor,
    InMemorySourceImageCache,
} from "@bernouy/cms-source-images";
import { SharpSourceImageTransformer } from "@bernouy/cms-source-images/sharp";
import type { SourceEndpoint } from "@bernouy/cms-sources";
import { InMemoryCache } from "@bernouy/http-runner";
import { generateComponentJsEntry } from "cms-delivery/core/assets/buildComponent";
import ComponentServer from "cms-delivery/endpoints/assets/component.server";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { DeliveryCmsContext } from "cms-delivery/runtime/DeliveryCmsContext";
import sharp from "sharp";

describe("responsive Source image delivery rollout", () => {
    test("keeps an old immutable responsive bundle truthful during the transform drain", async () => {
        const candidate = await immutableResponsiveCandidate(384);
        const source = new Uint8Array(
            await sharp({
                create: {
                    width: 800,
                    height: 600,
                    channels: 3,
                    background: { r: 40, g: 100, b: 180 },
                },
            })
                .png()
                .toBuffer(),
        );
        const next = mock(async (request: Request) => {
            expect(new URL(request.url).searchParams.has("cms-width")).toBe(false);
            return new Response(source, {
                headers: {
                    "content-type": "image/png",
                    "cache-control": "public, max-age=3600",
                },
            });
        });
        const cache = new InMemorySourceImageCache({ maxEntries: 1 });
        const interceptor = createSourceImageInterceptor({
            cache,
            transformer: new SharpSourceImageTransformer(),
            scope: "delivery-rollout-test",
        });

        async function expectWidth(candidateUrl: string, width: number, height: number): Promise<void> {
            const transformed = await interceptor(
                imageEndpoint(),
                new Request(new URL(candidateUrl, "http://localhost")),
                next,
            );
            const metadata = await sharp(await transformed.arrayBuffer()).metadata();
            expect(transformed.status).toBe(200);
            expect(transformed.headers.get("content-type")).toBe("image/webp");
            expect(metadata.width).toBe(width);
            expect(metadata.height).toBe(height);
        }

        await expectWidth(candidate, 384, 288);
        await expectWidth(candidate, 384, 288);
        expect(next).toHaveBeenCalledTimes(1);

        const evictionCandidate = new URL(candidate, "http://localhost");
        evictionCandidate.searchParams.set("cms-width", "512");
        await expectWidth(evictionCandidate.href, 512, 384);
        await expectWidth(candidate, 384, 288);
        expect(next).toHaveBeenCalledTimes(3);
    }, 10_000);

    test("never serves an original under a stale immutable bundle width descriptor after a hard kill", async () => {
        const candidate = await immutableResponsiveCandidate(64);
        const next = mock(async () => new Response("original", { headers: { "content-type": "image/png" } }));
        const rejected = await createDisabledSourceImageInterceptor()(
            imageEndpoint(),
            new Request(new URL(candidate, "http://localhost")),
            next,
        );
        expect(rejected.status).toBe(503);
        expect(rejected.headers.get("cache-control")).toBe("no-store");
        expect(next).toHaveBeenCalledTimes(0);
    });

    test("does not cache an unknown or ambiguous component version", async () => {
        const delivery = {
            cache: new InMemoryCache(),
            responsiveSourceImageRollout: { public: false, private: false },
        } as unknown as DeliveryCms;
        for (const url of [
            "http://localhost/.cms/assets/component.js?v=unknown",
            "http://localhost/.cms/assets/component.js?v=one&v=two",
        ]) {
            const response = await ComponentServer(new Request(url), delivery);
            expect(response.status).toBe(404);
            expect(response.headers.get("cache-control")).toBe("no-store");
        }
    });

    test("keeps both markup cohorts disabled when the Source interceptor is absent", () => {
        const withoutInterceptor = new DeliveryCmsContext({
            repository: {} as ContentReader,
            responsivePublicSourceImagesEnabled: true,
            responsivePrivateSourceImagesEnabled: true,
        });
        const enabledByDefault = new DeliveryCmsContext({
            repository: {} as ContentReader,
            sourceImageInterceptor: async (_endpoint, request, next) => next(request),
        });
        const withInterceptor = new DeliveryCmsContext({
            repository: {} as ContentReader,
            responsivePublicSourceImagesEnabled: true,
            responsivePrivateSourceImagesEnabled: false,
            sourceImageInterceptor: async (_endpoint, request, next) => next(request),
        });

        expect(withoutInterceptor.responsiveSourceImageRollout).toEqual({ public: false, private: false });
        expect(enabledByDefault.responsiveSourceImageRollout).toEqual({ public: true, private: true });
        expect(withInterceptor.responsiveSourceImageRollout).toEqual({ public: true, private: false });
    });

    test("builds both responsive cohorts when no rollout override is supplied", async () => {
        expect((await generateComponentJsEntry()).hash).toBe(
            (await generateComponentJsEntry({ public: true, private: true })).hash,
        );
    });
});

async function immutableResponsiveCandidate(width: number): Promise<string> {
    const enabledEntry = await generateComponentJsEntry({ public: true, private: false });
    const response = await ComponentServer(
        new Request(`http://localhost/.cms/assets/component.js?v=${enabledEntry.hash}`),
        {
            cache: new InMemoryCache(),
            responsiveSourceImageRollout: { public: false, private: false },
        } as unknown as DeliveryCms,
    );
    const js = await response.text();
    (window as any).p9r = {};
    window.eval(js);
    const image = document.createElement("img");
    image.setAttribute("data-src", "/.cms/sources/catalog/image?id=7");
    image.setAttribute("data-source-width", "800");
    image.setAttribute("data-source-height", "600");
    image.setAttribute("data-source-image-access", "public");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect((window as any).p9r.syncResponsiveSourceImageElement(image)).toBe(true);
    const candidate = image
        .getAttribute("srcset")!
        .split(",")
        .map((entry) => entry.trim().split(/\s+/))
        .find(([, descriptor]) => descriptor === `${width}w`)?.[0];
    expect(candidate).toBeDefined();
    return candidate!;
}

function imageEndpoint(): SourceEndpoint {
    return {
        urn: "urn:commerce:publicOfferImage",
        method: "GET",
        targetUrl: "https://connector.test/image",
        access: { mode: "public" },
        responseKind: "file",
        mediaType: "image/*",
        output: [{ status: "200" }],
    };
}
