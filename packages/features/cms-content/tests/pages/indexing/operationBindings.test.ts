import { describe, expect, test } from "bun:test";
import { collectCmsMutationBindings, collectCmsQueryBindings } from "@bernouy/cms-content";

describe("collectCmsQueryBindings", () => {
    test("extracts remote query identities and their typed inputs", () => {
        expect(
            collectCmsQueryBindings(`
            <section cms-query="catalog:products.list as products" cms-query-input='{"limit":{"from":"literal","value":20},"category":{"from":"state","key":"@param:shop-category"}}'></section>
            <section cms-query="@page:shop-products as shared"></section>
        `),
        ).toEqual([
            {
                contractId: "catalog",
                capabilityId: "products.list",
                alias: "products",
                input: {
                    limit: { from: "literal", value: 20 },
                    category: { from: "state", key: "@param:shop-category" },
                },
            },
        ]);
    });

    test("omits malformed and absent inputs without inventing defaults", () => {
        expect(
            collectCmsQueryBindings(`
            <section cms-query="catalog:products.list as products"></section>
            <section cms-query="catalog:product.get as product" cms-query-input="not-json"></section>
        `),
        ).toEqual([
            { contractId: "catalog", capabilityId: "products.list", alias: "products" },
            { contractId: "catalog", capabilityId: "product.get", alias: "product" },
        ]);
    });
});

describe("collectCmsMutationBindings", () => {
    test("extracts form-owned logical mutations and their typed inputs", () => {
        expect(
            collectCmsMutationBindings(`
            <section cms-mutation="catalog:ignored as ignored"></section>
            <form cms-mutation="newsletter:subscribe as subscription"
                cms-mutation-input='{"audience":{"from":"state","key":"@page:newsletter-audience"}}'></form>
            <form cms-mutation="kernel.auth:login as session"></form>
        `),
        ).toEqual([
            {
                contractId: "newsletter",
                capabilityId: "subscribe",
                alias: "subscription",
                input: { audience: { from: "state", key: "@page:newsletter-audience" } },
            },
        ]);
    });

    test("ignores malformed and non-form mutation declarations", () => {
        expect(
            collectCmsMutationBindings(`
            <section cms-mutation="catalog:save as ignored"></section>
            <form cms-mutation="invalid"></form>
        `),
        ).toEqual([]);
    });
});
