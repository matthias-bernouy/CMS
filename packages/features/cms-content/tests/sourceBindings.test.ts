import { describe, expect, test } from "bun:test";
import { collectCmsSourceBindings } from "@bernouy/cms-content";

describe("collectCmsSourceBindings", () => {
    test("extracts source URLs, aliases, methods, and triggers", () => {
        expect(
            collectCmsSourceBindings(`
            <section cms-source="/.cms/sources/catalog/search?q=#{q} as products"></section>
            <form cms-source="/.cms/sources/newsletter/subscribe" cms-source-method="post" cms-source-trigger="submit"></form>
        `),
        ).toEqual([
            {
                url: "/.cms/sources/catalog/search?q=#{q}",
                alias: "products",
                method: "GET",
                trigger: "auto",
            },
            {
                url: "/.cms/sources/newsletter/subscribe",
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
