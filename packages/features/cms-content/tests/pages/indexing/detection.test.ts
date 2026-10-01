import { describe, expect, test } from "bun:test";
import {
    detectPageIndexingCandidates,
    PAGE_METADATA_PLATFORM_VARIABLES,
    PAGE_METADATA_RESERVED_NAMESPACES,
} from "@bernouy/cms-content";

const bound = (contract: string, capability: string, param: string, pageParam: string) =>
    `<main cms-source="/.cms/call/${contract}/${capability}" cms-source-method="POST" cms-source-body='{"${param}":{"from":"queryParam","name":"${pageParam}"}}'></main>`;

describe("detectPageIndexingCandidates", () => {
    test("keeps CMS metadata scopes reserved", () => {
        expect(PAGE_METADATA_RESERVED_NAMESPACES).toEqual(["content", "page", "site"]);
        expect(PAGE_METADATA_PLATFORM_VARIABLES).toEqual(["page.path", "site.host", "site.language", "site.name"]);
    });

    test("detects a selected gateway capability bound to a page query parameter", () => {
        expect(detectPageIndexingCandidates(bound("commerce", "product.get", "slug", "product"))).toEqual({
            status: "detected",
            candidates: [
                { contractId: "commerce", capabilityId: "product.get", inputParam: "slug", pageQueryParam: "product" },
            ],
        });
    });

    test("ignores submitted, external, malformed, and old Source bindings", () => {
        const html = `${bound("commerce", "product.get", "slug", "product").replace("<main ", '<main cms-source-trigger="submit" ')}
            <div cms-source="https://external.test/.cms/call/commerce/product.get" cms-source-method="POST" cms-source-body='{"slug":{"from":"queryParam","name":"product"}}'></div>
            <div cms-source="/.cms/sources/commerce/product?slug=#{product}"></div>`;
        expect(detectPageIndexingCandidates(html)).toEqual({ status: "none", candidates: [] });
    });

    test("deduplicates bindings, reports ambiguity, and supports a base path", () => {
        const html = `${bound("commerce", "product.get", "slug", "product")}${bound("commerce", "product.get", "slug", "product")}${bound("events", "event.get", "id", "event")}`;
        expect(detectPageIndexingCandidates(html).status).toBe("ambiguous");
        expect(detectPageIndexingCandidates(html).candidates).toHaveLength(2);
        expect(
            detectPageIndexingCandidates(
                bound("commerce", "product.get", "slug", "product").replaceAll("/.cms/call/", "/shop/.cms/call/"),
                { gatewayPrefix: "/shop/.cms/call" },
            ).status,
        ).toBe("detected");
    });
});
