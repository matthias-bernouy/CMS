import { describe, expect, test } from "bun:test";
import {
    detectPageIndexingCandidates,
    PAGE_METADATA_PLATFORM_VARIABLES,
    PAGE_METADATA_RESERVED_NAMESPACES,
} from "@bernouy/cms-content";

const bound = (contract: string, capability: string, param: string, pageParam: string) =>
    `<main cms-query="${contract}:${capability} as entity" cms-query-input='{"${param}":{"from":"sync","key":"@param:site-${pageParam}"}}'></main>`;

describe("detectPageIndexingCandidates", () => {
    test("keeps CMS metadata scopes reserved", () => {
        expect(PAGE_METADATA_RESERVED_NAMESPACES).toEqual(["content", "page", "site"]);
        expect(PAGE_METADATA_PLATFORM_VARIABLES).toEqual(["page.path", "site.host", "site.language", "site.name"]);
    });

    test("detects a selected gateway capability bound to a page query parameter", () => {
        expect(detectPageIndexingCandidates(bound("commerce", "product.get", "slug", "product"))).toEqual({
            status: "detected",
            candidates: [
                {
                    contractId: "commerce",
                    capabilityId: "product.get",
                    inputParam: "slug",
                    pageQueryParam: "site-product",
                },
            ],
        });
    });

    test("ignores local, missing-input, malformed, and old Source bindings", () => {
        const html = `<div cms-query="@page:site-product as product"></div>
            <div cms-query="commerce:product.get as product"></div>
            <div cms-query="commerce:product.get" cms-query-input='{"slug":{"from":"sync","key":"@param:site-product"}}'></div>
            <div cms-source="/.cms/call/commerce/product.get" cms-source-method="POST" cms-source-body='{"slug":{"from":"sync","key":"@param:site-product"}}'></div>`;
        expect(detectPageIndexingCandidates(html)).toEqual({ status: "none", candidates: [] });
    });

    test("deduplicates bindings and reports ambiguity", () => {
        const html = `${bound("commerce", "product.get", "slug", "product")}${bound("commerce", "product.get", "slug", "product")}${bound("events", "event.get", "id", "event")}`;
        expect(detectPageIndexingCandidates(html).status).toBe("ambiguous");
        expect(detectPageIndexingCandidates(html).candidates).toHaveLength(2);
    });
});
