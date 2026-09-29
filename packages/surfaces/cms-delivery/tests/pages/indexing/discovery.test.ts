import { describe, expect, test } from "bun:test";
import {
    discoverPageIndexingLocations,
    PageIndexingDiscoveryError,
} from "cms-delivery/core/seo/indexing/discoverPageIndexingLocations";
import { PRODUCT_PAGE } from "./fixtures";

const cursorPage = {
    ...PRODUCT_PAGE,
    indexing: {
        ...PRODUCT_PAGE.indexing,
        entity: {
            ...PRODUCT_PAGE.indexing.entity,
            discover: {
                ...PRODUCT_PAGE.indexing.entity.discover,
                pagination: { type: "cursor" as const, cursorParam: "cursor", nextCursorPath: "nextCursor" },
            },
        },
    },
};

describe("discoverPageIndexingLocations", () => {
    test("paginates a gateway capability once and fans out to pages with different query parameters", async () => {
        const calls: unknown[] = [];
        const secondPage = {
            ...cursorPage,
            id: "catalog-product",
            path: "/catalog/product",
            indexing: { ...cursorPage.indexing, entity: { ...cursorPage.indexing.entity, pageQueryParam: "item" } },
        };
        const locations = await discoverPageIndexingLocations([cursorPage, secondPage], async (...args) => {
            calls.push(args);
            return calls.length === 1
                ? Response.json({
                      items: [{ slug: "oak chair", updatedAt: "2026-08-22T10:00:00+02:00" }],
                      nextCursor: "second-page",
                  })
                : Response.json({ items: [{ slug: "lamp", updatedAt: "not-a-date" }], nextCursor: null });
        });
        expect(calls).toEqual([
            ["commerce", "product.list", {}],
            ["commerce", "product.list", { cursor: "second-page" }],
        ]);
        expect(locations).toEqual([
            { location: "/products/detail?product=oak+chair", lastModified: "2026-08-22T08:00:00.000Z" },
            { location: "/catalog/product?item=oak+chair", lastModified: "2026-08-22T08:00:00.000Z" },
            { location: "/products/detail?product=lamp" },
            { location: "/catalog/product?item=lamp" },
        ]);
    });

    test("does no gateway work for pages that disable indexing", async () => {
        expect(
            await discoverPageIndexingLocations(
                [{ ...PRODUCT_PAGE, indexing: { ...PRODUCT_PAGE.indexing, enabled: false } }],
                undefined,
            ),
        ).toEqual([]);
    });

    test("fails and cancels a discarded gateway response", async () => {
        let cancelled = false;
        const body = new ReadableStream({
            cancel() {
                cancelled = true;
            },
        });
        await expect(
            discoverPageIndexingLocations([PRODUCT_PAGE], async () => new Response(body, { status: 502 })),
        ).rejects.toBeInstanceOf(PageIndexingDiscoveryError);
        expect(cancelled).toBe(true);
    });
});
