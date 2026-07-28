import { describe, expect, test } from "bun:test";
import { RepositoryCatalogPageProvider } from "@bernouy/cms-repository/catalog";
import { catalogReader, EMPTY_CONTEXT, queryContext } from "./fixtures";

describe("repository catalog list page", () => {
    test("renders a useful server-side catalog and filter form without JavaScript", async () => {
        const provider = new RepositoryCatalogPageProvider(catalogReader());
        const result = await provider.resolvePage("/integrations", EMPTY_CONTEXT);
        const html = result?.page.content ?? "";

        expect(result?.page.path).toBe("/integrations");
        expect(result?.page.title).toBe("Integration catalog");
        expect(result?.cacheIdentity).toMatch(/^[a-f0-9]{64}$/);
        expect(html).toContain('<form action="/integrations" method="get"');
        expect(html).toContain('name="q"');
        expect(html).toContain('name="category"');
        expect(html).toContain('name="provider"');
        expect(html).toContain('name="compatibility"');
        expect(html).toContain("Commerce");
        expect(html).toContain("Newsletter");
        expect(html).toContain("2 of 2 integrations");
        expect(html).not.toContain("<script");
    });

    test("applies search, category, provider and compatibility filters on the server", async () => {
        const provider = new RepositoryCatalogPageProvider(catalogReader());
        for (const [searchParams, included, excluded] of [
            [{ q: ["checkout"] }, "Commerce", "Newsletter"],
            [{ category: ["Marketing"] }, "Newsletter", "Commerce"],
            [{ provider: ["stripe-webhooks"] }, "Commerce", "Newsletter"],
            [{ compatibility: ["not-applicable"] }, "Newsletter", "Commerce"],
        ] as const) {
            const result = await provider.resolvePage("/integrations", queryContext(searchParams));
            expect(result?.page.content).toContain(included);
            expect(result?.page.content).not.toContain(`>${excluded}</a>`);
        }
    });

    test("renders an explicit empty state and preserves the query value safely", async () => {
        const provider = new RepositoryCatalogPageProvider(catalogReader());
        const result = await provider.resolvePage("/integrations", queryContext({ q: ['Missing" <Value>'] }));

        expect(result?.page.content).toContain("No matching integrations");
        expect(result?.page.content).toContain('value="Missing&quot; &lt;Value&gt;"');
        expect(result?.page.content).not.toContain('value="Missing" <Value>"');
    });
});
