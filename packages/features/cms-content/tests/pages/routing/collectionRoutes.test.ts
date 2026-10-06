import { expect, test } from "bun:test";
import {
    InMemorySurfacePageRouteRegistry,
    synchronizeCollectionPageRoutes,
    withCollectionPageRoutes,
} from "@bernouy/cms-content";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";

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
    await synchronizeCollectionPageRoutes(routes, "site-a", snapshot());
    const initial = (await routes.list("site-a"))[0]!;
    const customized = await routes.setOverride("site-a", initial.page, "/admin/custom", initial.revision);

    await synchronizeCollectionPageRoutes(routes, "site-a", snapshot([{ ...page, defaultPath: "/admin/content" }]));
    expect(await routes.get("site-a", initial.page)).toMatchObject({
        defaultPath: "/admin/content",
        overridePath: "/admin/custom",
        path: "/admin/custom",
        revision: customized.revision + 1,
    });

    await synchronizeCollectionPageRoutes(routes, "site-a", { revision: 2, collections: [] });
    expect(await routes.list("site-a")).toEqual([]);
});

test("a partially failed reconciliation is idempotent and recoverable", async () => {
    const inner = new InMemorySurfacePageRouteRegistry();
    let registrations = 0;
    const routes = new Proxy(inner, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (property !== "register" || typeof value !== "function") {
                return typeof value === "function" ? value.bind(target) : value;
            }
            return async (...args: Parameters<typeof inner.register>) => {
                registrations += 1;
                if (registrations === 2) {
                    throw new Error("simulated route-store interruption");
                }
                return value.apply(target, args);
            };
        },
    });
    const second = { ...page, id: "details", defaultPath: "/admin/details" };
    await expect(synchronizeCollectionPageRoutes(routes, "site-a", snapshot([page, second]))).rejects.toThrow(
        "simulated",
    );
    await synchronizeCollectionPageRoutes(routes, "site-a", snapshot([page, second]));
    expect(await routes.list("site-a")).toHaveLength(2);
});

test("the routed collection facade preserves non-mutating class methods", async () => {
    const store = withCollectionPageRoutes(
        new CollectionStore(new MemoryCollectionStorage()),
        new InMemorySurfacePageRouteRegistry(),
    );

    expect(await store.revision("site-a")).toBe(0);
    expect(await store.snapshot("site-a")).toEqual({ revision: 0, collections: [] });
});

test("collection activation rejects a missing site Page target", async () => {
    const raw = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await raw.importRelease(
        collectionRelease(`<a data-cms-page-ref='{"kind":"site","pageId":"missing"}'>Missing site Page</a>`),
    );
    const store = withCollectionPageRoutes(raw, new InMemorySurfacePageRouteRegistry(), {
        getSitePages: async () => [],
    });

    await expect(store.install("site-a", artifact.digest, 0)).rejects.toThrow("unavailable site Page");
    expect(await raw.snapshot("site-a")).toEqual({ revision: 0, collections: [] });
});

test("collection removal cannot orphan an editable Page reference", async () => {
    const raw = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await raw.importRelease(collectionRelease("<main>Overview</main>"));
    const sitePage = {
        id: "site-page",
        surface: "control",
        path: "/admin/site-page",
        content: `<a data-cms-page-ref='{"kind":"collection","publisherId":"ulvia.official","collectionId":"official","pageId":"overview"}'>Overview</a>`,
    } as never;
    const store = withCollectionPageRoutes(raw, new InMemorySurfacePageRouteRegistry(), {
        getSitePages: async () => [sitePage],
    });
    await store.install("site-a", artifact.digest, 0);

    await expect(store.uninstall("site-a", "official", 1)).rejects.toThrow("orphan");
    expect((await raw.snapshot("site-a")).collections).toHaveLength(1);
});

function collectionRelease(html: string) {
    return {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        publisherId: "ulvia.official",
        collectionId: "official",
        version: "1.0.0",
        name: "collection.name",
        locale: "en",
        translations: { en: { "collection.name": "Official", "page.overview.name": "Overview" } },
        assets: [],
        blocs: [],
        pages: [
            {
                id: "overview",
                generation: 1,
                surface: "control",
                defaultPath: "/admin",
                name: "page.overview.name",
                uses: [],
                requires: [],
                document: { html },
            },
        ],
    };
}
