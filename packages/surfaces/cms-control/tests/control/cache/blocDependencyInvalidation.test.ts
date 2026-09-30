import { describe, expect, test } from "bun:test";
import { P9R_CACHE } from "@bernouy/cms-content";
import {
    invalidatePagesReferencingBloc,
    invalidateUpdatedPage,
} from "cms-control/core/admin/server/cache/invalidation";

function system() {
    const deleted: string[] = [];
    const views: Record<string, string> = {
        "site-header": "const t = `<base-nav></base-nav>`;",
        "base-nav": "const t = `<base-link></base-link>`;",
        "base-link": "LINK();",
        "article-card": "ARTICLE();",
    };
    const cms = {
        repository: {
            getAllPages: async () => [
                { path: "/", paths: { fr: "/", en: "/home" }, content: "<site-header></site-header>" },
                { path: "/article", content: "<article-card></article-card>" },
            ],
            getSystem: async () => ({ site: { language: "fr" } }),
            getBlocsList: async () => Object.keys(views).map((id) => ({ id })),
            getBlocViewJS: async (tag: string) => views[tag] ?? null,
        },
        cache: { delete: (key: string) => deleted.push(key), deleteMatching: () => {} },
    };
    return { cms, deleted };
}

describe("invalidatePagesReferencingBloc", () => {
    test("invalidates a page that reaches the updated bloc transitively", async () => {
        const { cms, deleted } = system();
        await invalidatePagesReferencingBloc(cms as never, "base-link");
        expect(deleted).toEqual([P9R_CACHE.page("/"), P9R_CACHE.page("/en/home")]);
    });

    test("keeps unrelated pages cached", async () => {
        const { cms, deleted } = system();
        await invalidatePagesReferencingBloc(cms as never, "missing-card");
        expect(deleted).toEqual([]);
    });
});

test("page updates clear collection revision variants without touching neighboring paths", async () => {
    const keys = new Set([
        P9R_CACHE.page("/a"),
        `${P9R_CACHE.page("/a")}:collections:1`,
        `${P9R_CACHE.page("/a")}:collections:2`,
        P9R_CACHE.page("/about"),
    ]);
    const cms = {
        cache: {
            delete: (key: string) => keys.delete(key),
            deleteMatching: (predicate: (key: string) => boolean) => {
                for (const key of keys) {
                    if (predicate(key)) {
                        keys.delete(key);
                    }
                }
            },
        },
    };
    await invalidateUpdatedPage(cms as never, { path: "/a" } as never, "en");
    expect([...keys]).toEqual([P9R_CACHE.page("/about")]);
});
