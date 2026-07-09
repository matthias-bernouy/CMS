import { describe, expect, test } from "bun:test";
import { resolveRelationPage } from "@bernouy/cms-relations";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import {
    offersSource,
    productOffersRelation,
} from "./helpers/relationFixtures";

describe("@bernouy/cms-relations runtime", () => {
    test("resolves a reference relation page through the target endpoint", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(offersSource());
        const seen: string[] = [];

        const result = await resolveRelationPage(
            productOffersRelation(),
            { id: "product-100" },
            { limit: 10, offset: 20 },
            {
                sources,
                fetchImpl: async (input) => {
                    const url = new URL(String(input));
                    seen.push(url.searchParams.toString());
                    return Response.json({
                        items: [{ id: "offer-1", productId: url.searchParams.get("productId") }],
                        total: 42,
                    });
                },
            },
        );

        expect(seen).toEqual(["productId=product-100&limit=10&offset=20"]);
        expect(result).toEqual({
            items: [{ id: "offer-1", productId: "product-100" }],
            total: 42,
            limit: 10,
            offset: 20,
        });
    });

    test("bounds page expressions used in relation params", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(offersSource());
        const relation = productOffersRelation();
        relation.binding = {
            kind: "reference",
            endpoint: { sourceId: "offers", endpointId: "offers" },
            params: { productId: "$from.id", limit: "$page.limit" },
        };
        relation.page!.limitParam = undefined;
        relation.page!.maxLimit = 25;
        const seen: string[] = [];

        const result = await resolveRelationPage(relation, { id: "product-100" }, { limit: 999 }, {
            sources,
            fetchImpl: async (input) => {
                const url = new URL(String(input));
                seen.push(url.searchParams.toString());
                return Response.json({ items: [], total: 0 });
            },
        });

        expect(seen).toEqual(["productId=product-100&limit=25"]);
        expect(result.limit).toBe(25);
    });

    test("only returns offset metadata when offset is applied upstream", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(offersSource());
        const relation = productOffersRelation();
        relation.page!.offsetParam = undefined;
        const seen: string[] = [];

        const result = await resolveRelationPage(relation, { id: "product-100" }, { limit: 10, offset: 20 }, {
            sources,
            fetchImpl: async (input) => {
                const url = new URL(String(input));
                seen.push(url.searchParams.toString());
                return Response.json({ items: [], total: 0 });
            },
        });

        expect(seen).toEqual(["productId=product-100&limit=10"]);
        expect(result).toEqual({ items: [], total: 0, limit: 10 });
    });

    test("applies normalized offset expressions used in relation params", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(offersSource());
        const relation = productOffersRelation();
        relation.binding = {
            kind: "reference",
            endpoint: { sourceId: "offers", endpointId: "offers" },
            params: { productId: "$from.id", offset: "$page.offset" },
        };
        relation.page!.offsetParam = undefined;

        const result = await resolveRelationPage(relation, { id: "product-100" }, { limit: 10, offset: -1 }, {
            sources,
            fetchImpl: async (input) => {
                const url = new URL(String(input));
                expect(url.searchParams.toString()).toBe("productId=product-100&limit=10&offset=0");
                return Response.json({ items: [], total: 0 });
            },
        });

        expect(result.offset).toBe(0);
    });
});
