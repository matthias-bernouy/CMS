import { expect, test } from "bun:test";
import { InMemorySurfacePageRouteRegistry, synchronizeCollectionPageRoutes } from "@bernouy/cms-content";

const page = {
    id: "overview",
    generation: 1,
    surface: "control" as const,
    defaultPath: "/admin",
    name: "page.overview.name",
    uses: [],
    requires: [],
    document: { html: "<main></main>" },
};

function snapshot(pages = [page]) {
    return {
        revision: 1,
        collections: [
            {
                collectionId: "official",
                digest: `sha256:${"a".repeat(64)}`,
                configuration: {},
                textOverrides: {},
                release: {
                    publisherId: "ulvia.official",
                    collectionId: "official",
                    version: "1.0.0",
                    locale: "en",
                    translations: { en: { "page.overview.name": "Overview" } },
                    assets: [],
                    blocs: [],
                    pages,
                },
            },
        ],
    } as never;
}

test("synchronizes collection routes outside reads and preserves overrides", async () => {
    const routes = new InMemorySurfacePageRouteRegistry();
    await synchronizeCollectionPageRoutes(routes, snapshot());
    const initial = (await routes.list())[0]!;
    const customized = await routes.setOverride(initial.page, "/admin/custom", initial.revision);

    await synchronizeCollectionPageRoutes(routes, snapshot([{ ...page, defaultPath: "/admin/content" }]));
    expect(await routes.get(initial.page)).toMatchObject({
        defaultPath: "/admin/content",
        overridePath: "/admin/custom",
        path: "/admin/custom",
        revision: customized.revision + 1,
    });

    await synchronizeCollectionPageRoutes(routes, { revision: 2, collections: [] });
    expect(await routes.list()).toEqual([]);
});
