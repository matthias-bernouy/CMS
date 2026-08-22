import { describe, expect, test } from "bun:test";
import { projectResolvedIndexingEntity, type SourceIndexingEntity } from "@bernouy/cms-sources";

const entity: SourceIndexingEntity = {
    id: "product-by-slug",
    label: "Product",
    resolve: {
        endpointUrn: "urn:commerce:product",
        identity: { key: "slug", inputParam: "slug", outputPath: "data.slug" },
    },
    discover: {
        endpointUrn: "urn:commerce:products",
        itemsPath: "items",
        identityPath: "slug",
    },
    variables: {
        description: { path: "data.description", type: "text" },
        price: { path: "data.price", type: "number" },
        title: { path: "data.title", type: "text" },
    },
};

describe("projectResolvedIndexingEntity", () => {
    test("projects the canonical identity and declared scalar variables", () => {
        expect(
            projectResolvedIndexingEntity(entity, {
                data: { description: null, price: 42, slug: "oak-chair", title: "Oak chair" },
                private: "ignored",
            }),
        ).toEqual({ identity: "oak-chair", variables: { price: 42, title: "Oak chair" } });
    });

    test("rejects responses without a scalar canonical identity", () => {
        expect(projectResolvedIndexingEntity(entity, { data: { slug: null, title: "Missing" } })).toBeNull();
    });

    test("does not expose values that contradict their declared variable type", () => {
        expect(projectResolvedIndexingEntity(entity, { data: { price: "42", slug: "chair", title: 42 } })).toEqual({
            identity: "chair",
            variables: {},
        });
    });

    test("traverses numeric array segments accepted by source validation", () => {
        const nestedArrayEntity: SourceIndexingEntity = {
            ...entity,
            resolve: { ...entity.resolve, identity: { ...entity.resolve.identity, outputPath: "items.0.slug" } },
            variables: { title: { path: "items.0.title", type: "text" } },
        };
        const rootArrayEntity: SourceIndexingEntity = {
            ...nestedArrayEntity,
            resolve: { ...entity.resolve, identity: { ...entity.resolve.identity, outputPath: "0.slug" } },
            variables: { title: { path: "0.title", type: "text" } },
        };
        const item = { slug: "oak-chair", title: "Oak chair" };

        expect(projectResolvedIndexingEntity(nestedArrayEntity, { items: [item] })).toEqual({
            identity: "oak-chair",
            variables: { title: "Oak chair" },
        });
        expect(projectResolvedIndexingEntity(rootArrayEntity, [item])).toEqual({
            identity: "oak-chair",
            variables: { title: "Oak chair" },
        });
    });
});
