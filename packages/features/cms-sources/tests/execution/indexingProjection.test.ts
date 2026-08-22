import { describe, expect, test } from "bun:test";
import {
    projectIndexingDiscoveryPage,
    projectResolvedIndexingEntity,
    type SourceIndexingEntity,
} from "@bernouy/cms-sources";

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

describe("projectIndexingDiscoveryPage", () => {
    test("projects identities, last modification dates, and offset totals", () => {
        const offsetEntity: SourceIndexingEntity = {
            ...entity,
            discover: {
                ...entity.discover,
                lastModifiedPath: "updatedAt",
                pagination: {
                    type: "offset",
                    limitParam: "limit",
                    offsetParam: "offset",
                    pageSize: 100,
                    totalPath: "total",
                },
            },
        };

        expect(
            projectIndexingDiscoveryPage(offsetEntity, {
                items: [
                    { slug: "oak-chair", updatedAt: "2026-08-22T10:00:00Z" },
                    { slug: "", updatedAt: "ignored" },
                    { slug: "table" },
                ],
                total: 2,
            }),
        ).toEqual({
            itemCount: 3,
            items: [{ identity: "oak-chair", lastModified: "2026-08-22T10:00:00Z" }, { identity: "table" }],
            total: 2,
        });
    });

    test("projects cursor continuation and rejects malformed pagination metadata", () => {
        const cursorEntity: SourceIndexingEntity = {
            ...entity,
            discover: {
                ...entity.discover,
                pagination: { type: "cursor", cursorParam: "cursor", nextCursorPath: "page.next" },
            },
        };

        expect(
            projectIndexingDiscoveryPage(cursorEntity, { items: [{ slug: "chair" }], page: { next: "two" } }),
        ).toEqual({
            itemCount: 1,
            items: [{ identity: "chair" }],
            nextCursor: "two",
        });
        expect(projectIndexingDiscoveryPage(cursorEntity, { items: [], page: { next: null } })).toEqual({
            itemCount: 0,
            items: [],
        });
        expect(projectIndexingDiscoveryPage(cursorEntity, { items: [], page: { next: 2 } })).toBeNull();
    });
});
