import { expect, test } from "bun:test";
import { renderPage } from "cms-content/pages/delivery/html/renderPage";
import type { RenderContext } from "cms-content/pages/delivery/html/RenderContext";
import type { TPage, ContentReader } from "@bernouy/cms-content/rendering";

const ctx: RenderContext = {
    content: {
        getRenderingSettings: async () => ({
            site: { name: "Test", language: "en", favicon: "", host: "", theme: "", visible: true },
        }),
        getRenderableBlocs: async () => [],
        getContentTexts: async () => [
            {
                namespace: "test",
                resolve: (locale: string) => ({ title: locale === "fr" ? "Commande" : "Order" }),
            },
        ],
    } as unknown as ContentReader,
    resolveAssets: async () => ({
        blocRuntimeUrl: "/bloc-runtime.js",
        bindingCoreUrl: "/binding.js",
        styleUrl: "/style.css",
        blocStyleUrls: [],
        blocUrls: [],
        scriptUrls: [],
    }),
    resolveContributedAssets: async (input) =>
        input.replace("{{ cms.asset.test.hero.svg }}", "/_content/collections/test/assets/hero.svg?v=digest"),
    faviconUrl: "/favicon.ico",
};
const page = {
    path: "/example",
    title: "Test",
    description: "",
    tags: [],
    visible: true,
    content: '<h2>{{ cms.i18n.test.title }}</h2><img src="{{ cms.asset.test.hero.svg }}"><p>{{ order.total }}</p>',
} as unknown as TPage;

test("Content sends translated HTML for the route language before any browser code runs", async () => {
    const [fr, en] = await Promise.all([
        renderPage(page, ctx, { language: "fr" }),
        renderPage(page, ctx, { language: "en" }),
    ]);
    const french = new TextDecoder().decode(fr.raw);
    expect(french).toContain("<h2>Commande</h2>");
    expect(french).toContain("{{ order.total }}");
    expect(french).not.toContain("cms.i18n");
    expect(french).toContain('src="/_content/collections/test/assets/hero.svg?v=digest"');
    expect(new TextDecoder().decode(en.raw)).toContain("<h2>Order</h2>");
});

test("Content refuses unresolved catalogue references", async () => {
    await expect(
        renderPage(page, {
            ...ctx,
            content: { ...ctx.content, getContentTexts: async () => [] },
        }),
    ).rejects.toThrow("Unknown content text");
});
