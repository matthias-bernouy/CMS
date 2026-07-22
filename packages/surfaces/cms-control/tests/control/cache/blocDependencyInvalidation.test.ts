import { describe, expect, test } from "bun:test";
import { P9R_CACHE } from "@bernouy/cms-content";
import { invalidatePagesReferencingBloc } from "cms-control/core/admin/server/cache/invalidation";

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
                { path: "/", content: "<site-header></site-header>" },
                { path: "/article", content: "<article-card></article-card>" },
            ],
            getBlocsList: async () => Object.keys(views).map((id) => ({ id })),
            getBlocViewJS: async (tag: string) => views[tag] ?? null,
        },
        cache: { delete: (key: string) => deleted.push(key) },
    };
    return { cms, deleted };
}

describe("invalidatePagesReferencingBloc", () => {
    test("invalidates a page that reaches the updated bloc transitively", async () => {
        const { cms, deleted } = system();
        await invalidatePagesReferencingBloc(cms as never, "base-link");
        expect(deleted).toEqual([P9R_CACHE.page("/")]);
    });

    test("keeps unrelated pages cached", async () => {
        const { cms, deleted } = system();
        await invalidatePagesReferencingBloc(cms as never, "missing-card");
        expect(deleted).toEqual([]);
    });
});
