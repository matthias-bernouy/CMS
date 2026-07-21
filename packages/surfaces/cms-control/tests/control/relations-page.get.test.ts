import { describe, expect, test } from "bun:test";
import { InMemoryRelationRepository, type CmsRelation } from "@bernouy/cms-relations";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import getRelationPage from "cms-control/api/relations/page.get";

describe("GET /api/relations/page", () => {
    test("resolves a paginated relation page from a source endpoint", async () => {
        const sources = new InMemorySourceRepository();
        const relations = new InMemoryRelationRepository();
        await sources.createSource({
            urn: "urn:offers",
            meta: { name: "Offers" },
            endpoints: [
                {
                    urn: "urn:offers:offers",
                    method: "GET",
                    access: { mode: "public" },
                    targetUrl: "https://api.example.com/offers",
                    input: {
                        params: [
                            { name: "productId", in: "query", schema: { type: "string" } },
                            { name: "limit", in: "query", schema: { type: "number" } },
                            { name: "offset", in: "query", schema: { type: "number" } },
                        ],
                    },
                },
            ],
        });
        await relations.createRelation(productOffersRelation());
        const seen: string[] = [];

        const response = await getRelationPage(
            new Request(
                "http://localhost/cms/api/relations/page?relation=product-offers&fromId=product-1&limit=10&offset=20",
            ),
            {
                sources,
                relations,
                sourceExecutorDeps: {
                    fetchImpl: async (input: RequestInfo | URL) => {
                        const url = new URL(String(input));
                        seen.push(url.searchParams.toString());
                        return Response.json({
                            items: [{ id: "offer-1", productId: url.searchParams.get("productId") }],
                            total: 1,
                        });
                    },
                },
            } as any,
        );

        expect(response.status).toBe(200);
        expect(seen).toEqual(["productId=product-1&limit=10&offset=20"]);
        expect(await response.json()).toEqual({
            items: [{ id: "offer-1", productId: "product-1" }],
            total: 1,
            limit: 10,
            offset: 20,
        });
    });
});

function productOffersRelation(): CmsRelation {
    return {
        id: "product-offers",
        from: { sourceId: "products", idPath: "id" },
        to: { sourceId: "offers", idPath: "id" },
        cardinality: "many",
        binding: {
            kind: "reference",
            endpoint: { sourceId: "offers", endpointId: "offers" },
            params: { productId: "$from.id" },
        },
        page: {
            itemsPath: "items",
            totalPath: "total",
            limitParam: "limit",
            offsetParam: "offset",
            defaultLimit: 25,
            maxLimit: 100,
        },
    };
}
