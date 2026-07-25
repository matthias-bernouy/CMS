import { describe, expect, mock, test } from "bun:test";
import { isSourceImageWidth, SOURCE_IMAGE_WIDTHS, SOURCE_RESPONSIVE_WEBP_V1 } from "@bernouy/cms-source-images";
import {
    imageEndpoint,
    interceptorHarness,
    invoke,
    PNG_BYTES,
    sourceRequest,
    upstreamImage,
} from "../helpers/interceptorHarness";

describe("Source image eligibility", () => {
    test("freezes the finite V1 contract", () => {
        expect(SOURCE_IMAGE_WIDTHS).toEqual([64, 128, 256, 384, 512, 768, 1024, 1280, 1600, 1920, 2560]);
        expect(SOURCE_RESPONSIVE_WEBP_V1).toMatchObject({
            id: "source-responsive-webp-v1",
            format: "webp",
            quality: 75,
            maxSourceBytes: 10 * 1024 * 1024,
            maxInputPixels: 40_000_000,
            animatedInput: "reject",
        });
        expect(Object.isFrozen(SOURCE_IMAGE_WIDTHS)).toBe(true);
        expect(Object.isFrozen(SOURCE_RESPONSIVE_WEBP_V1)).toBe(true);
        expect(Object.isFrozen(SOURCE_RESPONSIVE_WEBP_V1.widths)).toBe(true);
        expect(() => (SOURCE_IMAGE_WIDTHS as unknown as number[]).push(9_999)).toThrow();
        expect(isSourceImageWidth(9_999)).toBe(false);
    });

    test("preserves exact passthrough when no transform is requested", async () => {
        const harness = interceptorHarness();
        const expected = new Response("original", { status: 206, headers: { "x-test": "kept" } });
        const next = mock(async () => expected);
        const url = new URL(sourceRequest().url);
        url.searchParams.delete("cms-width");
        const request = new Request(url);
        const response = await invoke(harness.interceptor, harness.endpoint, request, next);
        expect(response.status).toBe(expected.status);
        expect(response.headers.get("x-test")).toBe("kept");
        expect(await response.text()).toBe("original");
        expect(next).toHaveBeenCalledWith(request);
        expect(harness.transformer.inspectCalls).toBe(0);
        expect(harness.observations[0]).toMatchObject({ outcome: "passthrough", reason: "not_requested" });
    });

    test.each([
        ["non-file", imageEndpoint({ responseKind: "json" as const })],
        ["non-image", imageEndpoint({ mediaType: "application/pdf" })],
        ["non-GET", imageEndpoint({ method: "POST" as const })],
        ["SVG", imageEndpoint({ mediaType: "image/svg+xml" })],
    ])("never transforms %s endpoints", async (_label, endpoint) => {
        const harness = interceptorHarness();
        const response = await invoke(harness.interceptor, endpoint, sourceRequest(), harness.next);
        expect(response.status).toBe(400);
        expect(harness.next).toHaveBeenCalledTimes(0);
        expect(harness.transformer.transformCalls).toBe(0);
        expect(harness.observations[0]?.reason).toBe("ineligible_endpoint");
    });

    test("keeps an ineligible endpoint unchanged when no CMS parameter exists", async () => {
        const harness = interceptorHarness();
        const endpoint = imageEndpoint({ responseKind: "json" });
        const url = new URL(sourceRequest().url);
        url.searchParams.delete("cms-width");
        const response = await invoke(harness.interceptor, endpoint, new Request(url), harness.next);
        expect(response.status).toBe(200);
        expect(harness.next).toHaveBeenCalledTimes(1);
    });

    test("preserves upstream errors without reading or transforming them", async () => {
        const harness = interceptorHarness();
        const expected = upstreamImage({ status: 404, bytes: new TextEncoder().encode("not found") });
        const response = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), async () => expected);
        expect(response).toBe(expected);
        expect(await response.text()).toBe("not found");
        expect(harness.transformer.inspectCalls).toBe(0);
        expect(harness.observations[0]).toMatchObject({ outcome: "upstream_response", reason: "upstream_status" });
    });

    test("fails closed for an undeclared successful status without transforming or caching it", async () => {
        const harness = interceptorHarness();
        const next = mock(async () => upstreamImage({ status: 201 }));

        const response = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);

        expect(response.status).toBe(502);
        expect(response.headers.get("content-type")).not.toStartWith("image/");
        expect(harness.transformer.inspectCalls).toBe(0);
        expect(harness.cache.derivativeCount).toBe(0);
        expect(harness.observations[0]).toMatchObject({
            outcome: "rejected",
            reason: "upstream_status",
        });
    });

    test.each([
        ["text response", "text/plain", PNG_BYTES],
        ["signature mismatch", "image/png", new TextEncoder().encode("not an image")],
        ["MIME mismatch", "image/jpeg", PNG_BYTES],
    ])("rejects %s without poisoning cache", async (_label, contentType, bytes) => {
        const harness = interceptorHarness();
        const next = mock(async () => upstreamImage({ contentType, bytes }));
        const first = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        const second = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        expect(first.status).toBe(502);
        expect(second.status).toBe(502);
        expect(harness.cache.derivativeCount).toBe(0);
        expect(next).toHaveBeenCalledTimes(2);
    });

    test("enforces the streamed byte limit even without Content-Length", async () => {
        const recipe = { ...SOURCE_RESPONSIVE_WEBP_V1, maxSourceBytes: 11 };
        const harness = interceptorHarness({ recipe });
        const next = mock(async () => upstreamImage({ bytes: PNG_BYTES }));
        const response = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        expect(response.status).toBe(502);
        expect(harness.transformer.inspectCalls).toBe(0);
        expect(harness.cache.derivativeCount).toBe(0);
        expect(harness.observations[0]?.reason).toBe("source_too_large");
    });

    test("uses Content-Length only as a fast oversized rejection", async () => {
        const harness = interceptorHarness();
        const next = mock(
            async () =>
                new Response(PNG_BYTES.slice().buffer, {
                    headers: {
                        "content-type": "image/png",
                        "content-length": String(SOURCE_RESPONSIVE_WEBP_V1.maxSourceBytes + 1),
                    },
                }),
        );
        expect((await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next)).status).toBe(502);
        expect(harness.transformer.inspectCalls).toBe(0);
    });
});
