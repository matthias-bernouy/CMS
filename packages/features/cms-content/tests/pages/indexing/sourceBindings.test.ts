import { describe, expect, test } from "bun:test";
import { collectCmsQueryBindings, collectCmsSourceBindings } from "@bernouy/cms-content";

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

describe("collectCmsSourceBindings", () => {
    test("extracts source URLs, aliases, methods, and triggers", () => {
        expect(
            collectCmsSourceBindings(`
            <section cms-source="/.cms/call/catalog/search?limit=20 as products"></section>
            <form cms-source="/.cms/call/newsletter/subscribe" cms-source-method="post" cms-source-trigger="submit"></form>
        `),
        ).toEqual([
            {
                url: "/.cms/call/catalog/search?limit=20",
                alias: "products",
                method: "GET",
                trigger: "auto",
            },
            {
                url: "/.cms/call/newsletter/subscribe",
                method: "POST",
                trigger: "submit",
            },
        ]);
    });

    test("ignores empty source attributes and normalizes invalid options", () => {
        expect(
            collectCmsSourceBindings(`
            <section cms-source=" "></section>
            <section cms-source="/api/items" cms-source-method="TRACE" cms-source-trigger="hover"></section>
        `),
        ).toEqual([
            {
                url: "/api/items",
                method: "GET",
                trigger: "auto",
            },
        ]);
    });
});
