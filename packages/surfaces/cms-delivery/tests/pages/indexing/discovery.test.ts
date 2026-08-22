import { describe, expect, test } from "bun:test";
import type { Source, SourceRepository } from "@bernouy/cms-sources";
import {
    discoverPageIndexingLocations,
    PageIndexingDiscoveryError,
} from "cms-delivery/core/seo/discoverPageIndexingLocations";
import { COMMERCE_SOURCE, PRODUCT_PAGE } from "./fixtures";

describe("discoverPageIndexingLocations", () => {
    test("paginates one entity once and fans it out to every bound page", async () => {
        const source = cursorSource();
        let sourceReads = 0;
        const sources = {
            getSource: async () => {
                sourceReads += 1;
                return source;
            },
        } as Pick<SourceRepository, "getSource">;
        const calls: Array<Readonly<Record<string, string | number>>> = [];
        const secondPage = {
            ...PRODUCT_PAGE,
            id: "catalog-product",
            path: "/catalog/product",
            indexing: {
                ...PRODUCT_PAGE.indexing,
                entity: { ...PRODUCT_PAGE.indexing.entity, pageQueryParam: "item" },
            },
        };

        const locations = await discoverPageIndexingLocations(
            [PRODUCT_PAGE, secondPage],
            sources,
            async (_endpoint, params) => {
                calls.push(params);
                return calls.length === 1
                    ? Response.json({
                          items: [{ slug: "oak chair", updatedAt: "2026-08-22T10:00:00+02:00" }],
                          nextCursor: "second-page",
                      })
                    : Response.json({
                          items: [{ slug: "lamp", updatedAt: "not-a-date" }],
                          nextCursor: null,
                      });
            },
        );

        expect(sourceReads).toBe(1);
        expect(calls).toEqual([{}, { cursor: "second-page" }]);
        expect(locations).toEqual([
            {
                location: "/products/detail?product=oak+chair",
                lastModified: "2026-08-22T08:00:00.000Z",
            },
            { location: "/catalog/product?item=oak+chair", lastModified: "2026-08-22T08:00:00.000Z" },
            { location: "/products/detail?product=lamp" },
            { location: "/catalog/product?item=lamp" },
        ]);
    });

    test("does no source work for pages that disable indexing", async () => {
        expect(
            await discoverPageIndexingLocations(
                [{ ...PRODUCT_PAGE, indexing: { ...PRODUCT_PAGE.indexing, enabled: false } }],
                undefined,
                undefined,
            ),
        ).toEqual([]);
    });

    test("fails boundedly and cancels a discarded source response", async () => {
        let cancelled = false;
        const body = new ReadableStream({
            cancel() {
                cancelled = true;
            },
        });
        const sources = {
            getSource: async () => cursorSource(),
        } as Pick<SourceRepository, "getSource">;

        const discovery = discoverPageIndexingLocations(
            [PRODUCT_PAGE],
            sources,
            async () => new Response(body, { status: 502 }),
        );

        await expect(discovery).rejects.toBeInstanceOf(PageIndexingDiscoveryError);
        expect(cancelled).toBe(true);
    });
});

function cursorSource(): Source {
    const indexingEntity = COMMERCE_SOURCE.indexing!.entities[0]!;
    return {
        ...COMMERCE_SOURCE,
        indexing: {
            entities: [
                {
                    ...indexingEntity,
                    discover: {
                        ...indexingEntity.discover,
                        pagination: {
                            type: "cursor",
                            cursorParam: "cursor",
                            nextCursorPath: "nextCursor",
                        },
                    },
                },
            ],
        },
    };
}
