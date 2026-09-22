import { describe, expect, test } from "bun:test";
import {
    resolvePageMetadataTemplate,
    resolvePageMetadataTemplateResult,
    type PageMetadataContext,
} from "@bernouy/cms-content";

const context: PageMetadataContext = {
    content: { price: 42, title: "Oak chair" },
    page: { path: "/products/detail" },
    site: { host: "https://shop.test", language: "en", name: "Shop" },
};

describe("resolvePageMetadataTemplate", () => {
    test("resolves content, page, and site variables", () => {
        expect(resolvePageMetadataTemplate("${content.title} — ${site.name} (${content.price})", context)).toBe(
            "Oak chair — Shop (42)",
        );
        expect(resolvePageMetadataTemplate("At ${page.path}", context)).toBe("At /products/detail");
    });

    test("removes unavailable reserved variables without evaluating arbitrary expressions", () => {
        expect(
            resolvePageMetadataTemplate("${ content.missing } ${unknown.value} ${site.name.toUpperCase()}", context),
        ).toBe(" ${unknown.value} ${site.name.toUpperCase()}");
        expect(resolvePageMetadataTemplateResult("Buy ${content.missing}", context)).toEqual({
            value: "Buy ",
            complete: false,
        });
        expect(resolvePageMetadataTemplateResult("${site.name.toUpperCase()}", context).complete).toBe(false);
        expect(resolvePageMetadataTemplateResult("Hosted by ${site.host}", { ...context, site: { host: "" } })).toEqual(
            {
                value: "Hosted by ",
                complete: false,
            },
        );
    });

    test("does not interpret placeholder-like text introduced by a resolved value", () => {
        expect(
            resolvePageMetadataTemplateResult("${content.title}", {
                ...context,
                content: { title: "Starter ${kit}" },
            }),
        ).toEqual({ value: "Starter ${kit}", complete: true });
    });
});
