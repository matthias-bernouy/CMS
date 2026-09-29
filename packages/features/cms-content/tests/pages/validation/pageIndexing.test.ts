import { describe, expect, test } from "bun:test";
import { validatePageIndexingConfiguration, validatePagePatch } from "@bernouy/cms-content";

const entity = {
    contractId: "commerce",
    label: "Product",
    pageQueryParam: "product",
    resolve: { capabilityId: "product.get", inputParam: "slug", identityPath: "slug" },
    discover: {
        capabilityId: "product.list",
        itemsPath: "items",
        identityPath: "slug",
        pagination: { type: "offset", limitParam: "limit", offsetParam: "offset", pageSize: 100 },
    },
    variables: { title: { path: "title", type: "text" } },
};

describe("page indexing validation", () => {
    test("accepts explicit gateway capabilities and projection paths", () => {
        expect(validatePageIndexingConfiguration({ enabled: true, entity })).toEqual({ enabled: true, entity });
        expect(validatePagePatch({ indexing: { enabled: false } })).toEqual({ indexing: { enabled: false } });
    });

    test("rejects old Source references and unsafe projections", () => {
        for (const invalid of [
            { ...entity, contractId: "urn:commerce" },
            { ...entity, resolve: { ...entity.resolve, identityPath: "__proto__.x" } },
            { ...entity, variables: { title: { path: "title", type: "script" } } },
            {
                ...entity,
                discover: { ...entity.discover, pagination: { ...entity.discover.pagination, pageSize: 1001 } },
            },
            { ...entity, pageQueryParam: "bad param" },
        ]) {
            expect(() => validatePageIndexingConfiguration({ enabled: true, entity: invalid })).toThrow();
        }
    });
});
