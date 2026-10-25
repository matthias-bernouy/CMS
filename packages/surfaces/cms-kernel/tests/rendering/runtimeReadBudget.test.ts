import { expect, test } from "bun:test";
import { defaultSystem, type ContentReader, type TPage } from "@bernouy/cms-content";
import { mountPublicPages } from "../pages/publicPage.fixture";

test("reuses Page rendering inputs within a cold render and skips them on a cache hit", async () => {
    const calls = new Map<string, number>();
    const count = (operation: string) => calls.set(operation, (calls.get(operation) ?? 0) + 1);
    const page: TPage = {
        id: "home",
        revision: 1,
        path: "/",
        title: "Home",
        description: "Home page",
        content: '<article cms-bloc="site-card"></article>',
        visible: true,
        tags: [],
    };
    const renderable = {
        reference: { kind: "site" as const, pageId: page.id },
        page,
        source: { kind: "site" as const, pageId: page.id, revision: page.revision },
        requirements: [],
    };
    const settings = defaultSystem();
    settings.initializationStep = 1;
    settings.site.visible = true;
    const content: ContentReader = {
        getContentRevision: async () => {
            count("contentRevision");
            return 7;
        },
        getRenderingRevision: async () => {
            count("renderingRevision");
            return "7:3";
        },
        getContentTexts: async () => {
            count("contentTexts");
            return [];
        },
        getRenderablePage: async () => renderable,
        getRenderablePages: async () => [renderable],
        resolvePageReference: async () => null,
        resolvePagePaths: async () => ({}),
        resolveRenderableRoute: async () => {
            count("renderableRoute");
            return { kind: "current", page: renderable, language: "en" };
        },
        getPublishedPage: async () => page,
        getPublishedPageById: async () => page,
        getPublishedPages: async () => {
            count("publishedPages");
            return [page];
        },
        resolvePublishedRoute: async () => null,
        getRenderableBlocs: async () => {
            count("renderableBlocs");
            return [
                {
                    id: "site-card",
                    kind: "component",
                    markupHTML: "<slot></slot>",
                    root: { accepts: ["article"] },
                    hasBehavior: true,
                },
            ];
        },
        getBlocViewJS: async () => {
            count("blocViewJS");
            return "export function mount() {}";
        },
        getRenderingSettings: async () => {
            count("renderingSettings");
            return settings;
        },
    };
    const mounted = mountPublicPages({ repository: content });

    expect((await mounted.get(new Request("https://example.test/"))).status).toBe(200);
    expect(Object.fromEntries(calls)).toEqual({
        renderableRoute: 1,
        renderingSettings: 1,
        renderableBlocs: 1,
        blocViewJS: 1,
        contentTexts: 1,
        renderingRevision: 1,
    });

    expect((await mounted.get(new Request("https://example.test/"))).status).toBe(200);
    expect(Object.fromEntries(calls)).toEqual({
        renderableRoute: 2,
        renderingSettings: 2,
        renderableBlocs: 1,
        blocViewJS: 1,
        contentTexts: 1,
        renderingRevision: 2,
    });
});
