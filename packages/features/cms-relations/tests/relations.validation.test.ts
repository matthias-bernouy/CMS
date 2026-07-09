import { describe, expect, test } from "bun:test";
import {
    DuplicateRelationError,
    InMemoryRelationRepository,
    dashboardRelationProjectionId,
    validateDashboardRelationProjection,
    validateRelation,
    validateRelationSources,
    type CmsRelation,
} from "@bernouy/cms-relations";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import {
    offersSource,
    productOffersProjection,
    productOffersRelation,
} from "./helpers/relationFixtures";

describe("@bernouy/cms-relations validation", () => {
    test("validates that many relations declare bounded pagination", () => {
        const relation: CmsRelation = {
            id: "product-offers",
            from: { sourceId: "products" },
            to: { sourceId: "offers" },
            cardinality: "many",
            binding: {
                kind: "reference",
                endpoint: { sourceId: "offers", endpointId: "offers" },
                params: { productId: "$from.id" },
            },
        };

        expect(validateRelation(relation)).toContain("many relations must declare page");
    });

    test("stores cloned relations in memory", async () => {
        const relations = new InMemoryRelationRepository();
        const relation = productOffersRelation();

        await relations.createRelation(relation);
        relation.label = "Mutated";

        await expect(relations.createRelation(productOffersRelation())).rejects.toBeInstanceOf(DuplicateRelationError);
        expect(await relations.getRelation("product-offers")).toMatchObject({ label: "Offers" });
        expect(await relations.getRelationsForSource("products")).toHaveLength(1);
        expect(await relations.deleteRelation("product-offers")).toBe(true);
    });

    test("stores dashboard relation projections in memory", async () => {
        const relations = new InMemoryRelationRepository();
        const projection = productOffersProjection();

        expect(validateDashboardRelationProjection(projection)).toEqual([]);
        await relations.createDashboardRelationProjection(projection);
        projection.title = "Mutated";

        const id = dashboardRelationProjectionId(projection);
        expect(id).toBe("products-products:productDetail:product-offers");
        expect(await relations.getDashboardRelationProjection(id)).toMatchObject({ title: "Offers" });
        expect(await relations.getDashboardRelationProjectionsForDashboard("products-products")).toHaveLength(1);
        expect(await relations.deleteDashboardRelationProjection(id)).toBe(true);
    });

    test("validates referenced source endpoints and params", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(offersSource());

        expect(await validateRelationSources(productOffersRelation(), sources)).toEqual([]);

        const invalid = productOffersRelation();
        invalid.page!.offsetParam = "after";
        expect(await validateRelationSources(invalid, sources)).toContain('product-offers.page.after is not declared by endpoint "urn:offers:offers"');
    });
});
