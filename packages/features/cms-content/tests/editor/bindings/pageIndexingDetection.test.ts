import { describe, expect, test } from "bun:test";
import {
    detectPageIndexingCandidates,
    PAGE_METADATA_PLATFORM_VARIABLES,
    PAGE_METADATA_RESERVED_NAMESPACES,
} from "@bernouy/cms-content";
import type { Source, SourceIndexingEntity } from "@bernouy/cms-sources";

function indexingEntity(id: string, sourceId: string, endpointId: string, identity: string): SourceIndexingEntity {
    return {
        id,
        label: id.startsWith("event") ? "Event" : "Product",
        resolve: {
            endpointUrn: `urn:${sourceId}:${endpointId}`,
            identity: {
                key: identity,
                inputParam: identity,
                outputPath: identity,
            },
        },
        discover: {
            endpointUrn: `urn:${sourceId}:${endpointId}s`,
            itemsPath: "items",
            identityPath: identity,
        },
        variables: {
            title: { path: "title", type: "text" },
        },
    };
}

function indexedSource(sourceId: string, entities: SourceIndexingEntity[]): Source {
    return {
        urn: `urn:${sourceId}`,
        endpoints: [],
        indexing: { entities },
    };
}

const commerce = indexedSource("commerce", [
    indexingEntity("product-by-id", "commerce", "product", "id"),
    indexingEntity("product-by-slug", "commerce", "product", "slug"),
]);

describe("detectPageIndexingCandidates", () => {
    test("reserves platform scopes separately from integration variables", () => {
        expect(PAGE_METADATA_RESERVED_NAMESPACES).toEqual(["content", "page", "site"]);
        expect(PAGE_METADATA_PLATFORM_VARIABLES).toEqual(["page.path", "site.host", "site.language", "site.name"]);
    });

    test("detects the identity strategy bound to a public page query parameter", () => {
        expect(
            detectPageIndexingCandidates(
                `<main cms-source="/.cms/sources/commerce/product?slug=#{product} as product"></main>`,
                [commerce],
            ),
        ).toEqual({
            status: "detected",
            candidates: [
                {
                    sourceUrn: "urn:commerce",
                    endpointUrn: "urn:commerce:product",
                    entityId: "product-by-slug",
                    identity: {
                        key: "slug",
                        inputParam: "slug",
                        pageQueryParam: "product",
                    },
                },
            ],
        });
    });

    test("selects the id entity when the endpoint input uses id", () => {
        const result = detectPageIndexingCandidates(
            `<main cms-source="/.cms/sources/commerce/product?id=#{product}"></main>`,
            [commerce],
        );

        expect(result.status).toBe("detected");
        expect(result.candidates[0]?.entityId).toBe("product-by-id");
        expect(result.candidates[0]?.identity.pageQueryParam).toBe("product");
    });

    test("ignores discovery, static, submitted, and external bindings", () => {
        expect(
            detectPageIndexingCandidates(
                `
                    <div cms-source="/.cms/sources/commerce/products?slug=#{product}"></div>
                    <div cms-source="/.cms/sources/commerce/product?slug=fixed"></div>
                    <form cms-source="/.cms/sources/commerce/product?slug=#{product}" cms-source-trigger="submit"></form>
                    <div cms-source="https://example.com/.cms/sources/commerce/product?slug=#{product}"></div>
                `,
                [commerce],
            ),
        ).toEqual({ status: "none", candidates: [] });
    });

    test("reports different entities as ambiguous even when they use the same page query parameter", () => {
        const events = indexedSource("events", [indexingEntity("event-by-slug", "events", "event", "slug")]);
        const result = detectPageIndexingCandidates(
            `
                <article cms-source="/.cms/sources/commerce/product?slug=#{item}"></article>
                <aside cms-source="/.cms/sources/events/event?slug=#{item}"></aside>
            `,
            [commerce, events],
        );

        expect(result.status).toBe("ambiguous");
        expect(result.candidates.map(({ entityId }) => entityId)).toEqual(["product-by-slug", "event-by-slug"]);
    });

    test("deduplicates repeated bindings and supports a base-path-aware prefix", () => {
        const result = detectPageIndexingCandidates(
            `
                <main cms-source="/shop/.cms/sources/commerce/product?slug=#{product}"></main>
                <aside cms-source="/shop/.cms/sources/commerce/product?slug=#{product}"></aside>
            `,
            [commerce],
            { sourcePrefix: "/shop/.cms/sources/" },
        );

        expect(result.status).toBe("detected");
        expect(result.candidates).toHaveLength(1);
    });
});
