import { describe, expect, test } from "bun:test";
import { resolvePageIndexingMetadata } from "cms-delivery/core/seo/indexing/resolvePageIndexingMetadata";
import { PRODUCT_PAGE } from "./fixtures";

describe("resolvePageIndexingMetadata", () => {
    test("projects declared variables and canonical identity from a gateway capability", async () => {
        const calls: unknown[] = [];
        const result = await resolvePageIndexingMetadata(
            new Request("https://shop.test/products/detail?product=requested&utm_source=ignored"),
            PRODUCT_PAGE,
            async (...args) => {
                calls.push(args);
                return Response.json({
                    slug: "canonical-chair",
                    title: "Oak chair",
                    description: "Solid oak",
                    secret: "hidden",
                });
            },
        );
        expect(calls).toEqual([["commerce", "product.get", { slug: "requested" }]]);
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

    test("keeps metadata dynamic when indexing is disabled", async () => {
        const result = await resolvePageIndexingMetadata(
            new Request("https://shop.test/products/detail?product=chair"),
            { ...PRODUCT_PAGE, indexing: { ...PRODUCT_PAGE.indexing, enabled: false } },
            async () => Response.json({ slug: "chair", title: "Chair", description: "Description" }),
        );
        expect(result.kind === "render" && result.metadata.indexable).toBe(false);
        expect(result.kind === "render" && result.metadata.content?.title).toBe("Chair");
    });

    test("marks missing identity noindex and does not invoke a capability", async () => {
        let calls = 0;
        for (const url of [
            "https://shop.test/products/detail",
            "https://shop.test/products/detail?product=a&product=b",
        ]) {
            const result = await resolvePageIndexingMetadata(new Request(url), PRODUCT_PAGE, async () => {
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

    test("distinguishes missing, invalid and unavailable gateway responses", async () => {
        for (const [status, kind] of [
            [404, "not-found"],
            [400, "invalid-identity"],
            [422, "invalid-identity"],
            [502, "unavailable"],
        ] as const) {
            const result = await resolvePageIndexingMetadata(
                new Request("https://shop.test/products/detail?product=chair"),
                PRODUCT_PAGE,
                async () => new Response(null, { status }),
            );
            expect(result.kind).toBe(kind);
        }
    });
});
