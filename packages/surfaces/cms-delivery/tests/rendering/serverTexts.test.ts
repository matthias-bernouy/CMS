import { expect, test } from "bun:test";
import { renderPage } from "cms-delivery/core/html/renderPage";
import type { RenderContext } from "cms-delivery/core/html/RenderContext";
import type { TPage, ContentReader } from "@bernouy/cms-content/rendering";

const ctx: RenderContext = {
    repository: {
        getRenderingSettings: async () => ({
            site: { name: "Test", language: "en", favicon: "", host: "", theme: "", visible: true },
            security: { connectExtras: [], mediaExtras: [] },
        }),
        getRenderableBlocs: async () => [],
    } as unknown as ContentReader,
    resolveAssets: async () => ({
        componentUrl: "/component.js",
        bindingCoreUrl: "/binding.js",
        styleUrl: "/style.css",
        blocUrls: [],
        scriptUrls: [],
    }),
    faviconUrl: "/favicon.ico",
    headInjectors: [],
    collectionTexts: [
        {
            collection: {
                collectionId: "test",
                locale: "en",
                texts: [{ id: "title", values: { en: "Order", fr: "Commande" } }],
            },
        },
    ],
};
const page = {
    path: "/example",
    title: "Test",
    description: "",
    tags: [],
    visible: true,
    content: "<h2>{{ cms.i18n.test.title }}</h2><p>{{ order.total }}</p>",
} as unknown as TPage;

test("Delivery sends translated HTML for the route language before any browser code runs", async () => {
    const [fr, en] = await Promise.all([
        renderPage(page, ctx, { language: "fr" }),
        renderPage(page, ctx, { language: "en" }),
    ]);
    const french = new TextDecoder().decode(fr.raw);
    expect(french).toContain("<h2>Commande</h2>");
    expect(french).toContain("{{ order.total }}");
    expect(french).not.toContain("cms.i18n");
    expect(new TextDecoder().decode(en.raw)).toContain("<h2>Order</h2>");
});

test("Delivery refuses unresolved catalogue references", async () => {
    await expect(renderPage(page, { ...ctx, collectionTexts: [] })).rejects.toThrow("Unknown collection text");
});
