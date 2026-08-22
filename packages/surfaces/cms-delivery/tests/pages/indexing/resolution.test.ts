import { describe, expect, test } from "bun:test";
import type { SourceRepository } from "@bernouy/cms-sources";
import { resolvePageIndexingMetadata } from "cms-delivery/core/seo/resolvePageIndexingMetadata";
import { COMMERCE_SOURCE, PRODUCT_PAGE } from "./fixtures";

const sources = {
    getSource: async (urn: string) => (urn === COMMERCE_SOURCE.urn ? COMMERCE_SOURCE : null),
} as Pick<SourceRepository, "getSource">;

describe("resolvePageIndexingMetadata", () => {
    test("resolves declared variables and uses the response identity for canonical metadata", async () => {
        const calls: Array<{ endpoint: string; input: string; value: string }> = [];
        const result = await resolvePageIndexingMetadata(
            new Request("https://shop.test/products/detail?product=requested&utm_source=ignored"),
            PRODUCT_PAGE,
            sources,
            async (endpoint, input, value) => {
                calls.push({ endpoint, input, value });
                return Response.json({ slug: "canonical-chair", title: "Oak chair", description: "Solid oak" });
            },
        );

        expect(calls).toEqual([{ endpoint: "urn:commerce:product", input: "slug", value: "requested" }]);
        expect(result).toEqual({
            kind: "render",
            dynamic: true,
            metadata: {
                canonical: { queryParam: "product", value: "canonical-chair" },
                content: { description: "Solid oak", title: "Oak chair" },
                fallbackTitle: "Oak chair",
                indexable: true,
            },
        });
    });

    test("keeps dynamic metadata available when indexing is disabled", async () => {
        const result = await resolvePageIndexingMetadata(
            new Request("https://shop.test/products/detail?product=chair"),
            { ...PRODUCT_PAGE, indexing: { ...PRODUCT_PAGE.indexing, enabled: false } },
            sources,
            async () => Response.json({ slug: "chair", title: "Chair", description: "Description" }),
        );

        expect(result.kind).toBe("render");
        expect(result.kind === "render" && result.metadata.indexable).toBe(false);
        expect(result.kind === "render" && result.metadata.content?.title).toBe("Chair");
    });

    test("marks a missing or duplicated public identity as noindex without endpoint work", async () => {
        let calls = 0;
        for (const url of [
            "https://shop.test/products/detail",
            "https://shop.test/products/detail?product=one&product=two",
        ]) {
            const result = await resolvePageIndexingMetadata(new Request(url), PRODUCT_PAGE, sources, async () => {
                calls += 1;
                return Response.json({});
            });
            expect(result).toEqual({
                kind: "render",
                dynamic: true,
                metadata: { canonical: null, fallbackTitle: "Product", indexable: false },
            });
        }
        expect(calls).toBe(0);
    });

    test("distinguishes missing entities from temporary source failures", async () => {
        const missing = await resolvePageIndexingMetadata(
            new Request("https://shop.test/products/detail?product=missing"),
            PRODUCT_PAGE,
            sources,
            async () => new Response("Not Found", { status: 404 }),
        );
        const unavailable = await resolvePageIndexingMetadata(
            new Request("https://shop.test/products/detail?product=chair"),
            PRODUCT_PAGE,
            sources,
            async () => new Response("Bad Gateway", { status: 502 }),
        );

        expect(missing).toEqual({ kind: "not-found" });
        expect(unavailable).toEqual({ kind: "unavailable", reason: "indexing endpoint returned 502" });
    });

    test.each([400, 422] as const)("preserves an invalid identity response with status %i", async (status) => {
        const result = await resolvePageIndexingMetadata(
            new Request("https://shop.test/products/detail?product=invalid"),
            PRODUCT_PAGE,
            sources,
            async () => new Response("Invalid identity", { status }),
        );

        expect(result).toEqual({ kind: "invalid-identity", status });
    });

    test.each([400, 404, 422, 502])("cancels a discarded source response with status %i", async (status) => {
        let cancelled = false;
        const body = new ReadableStream({
            cancel() {
                cancelled = true;
            },
        });

        await resolvePageIndexingMetadata(
            new Request("https://shop.test/products/detail?product=discarded"),
            PRODUCT_PAGE,
            sources,
            async () => new Response(body, { status }),
        );

        expect(cancelled).toBe(true);
    });
});
