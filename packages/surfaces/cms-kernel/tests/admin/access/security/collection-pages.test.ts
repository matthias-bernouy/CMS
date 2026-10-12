import { expect, test } from "bun:test";
import { InMemoryCmsRepository, InMemoryPageRouteRegistry, synchronizeSitePageRoutes } from "@bernouy/cms-content";
import { synchronizeCollectionPageRoutes, withInstalledCollections } from "@bernouy/cms-repository/collections/content";
import { mountPublicPages } from "../../../pages/publicPage.fixture";

test("collection Admin Pages render through site routes while preserving path overrides", async () => {
    const routes = new InMemoryPageRouteRegistry();
    const page = {
        id: "pages",
        generation: 1,
        defaultPath: "/admin",
        name: "page.pages.name",
        uses: [],
        requires: [],
        document: {
            html: `<section><h1>Collection Pages</h1><a data-cms-page-ref='{"kind":"contribution","sourceId":"ulvia.official","contributionId":"official","pageId":"details"}' data-cms-page-suffix="?id={{ page.id }}">Details</a></section>`,
        },
    };
    const details = {
        ...page,
        id: "details",
        defaultPath: "/admin/pages",
        name: "page.details.name",
        document: { html: "<h1>Page details</h1>" },
    };
    const installation = {
        collectionId: "official",
        digest: `sha256:${"a".repeat(64)}`,
        configuration: {},
        textOverrides: {},
        release: {
            publisherId: "ulvia.official",
            collectionId: "official",
            version: "1.0.0",
            locale: "en",
            translations: { en: { "page.pages.name": "Pages", "page.details.name": "Page details" } },
            blocs: [],
            pages: [page, details],
        },
    };
    const repository = new InMemoryCmsRepository();
    const collections = {
        siteId: "site-a",
        routes,
        store: {
            revision: async () => 4,
            snapshot: async () => ({ revision: 4, collections: [installation] }),
        },
        migrations: { getActive: async () => null },
    };
    await synchronizeCollectionPageRoutes(routes, "site-a", (await collections.store.snapshot()) as never);
    const projected = withInstalledCollections(repository, collections.store as never, "site-a", routes);
    const mounted = mountPublicPages({
        repository: projected,
        collections: { siteId: "site-a", migrations: collections.migrations as never },
    });

    const response = await mounted.get(new Request("http://admin.test/admin"));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Collection Pages");
    expect(html).toContain('href="/admin/pages?id={{ page.id }}"');
    expect(html).not.toContain("data-cms-page-ref");
    expect(html).toContain("default-src 'self'");

    const reference = {
        kind: "contribution" as const,
        sourceId: "ulvia.official",
        contributionId: "official",
        pageId: "pages",
    };
    const detailsReference = { ...reference, pageId: "details" };
    const detailsRoute = await routes.get("site-a", detailsReference);
    await routes.setOverride("site-a", detailsReference, "/admin/content", detailsRoute!.revision);
    const firstRoute = await routes.get("site-a", reference);
    await routes.setOverride("site-a", reference, "/admin/custom", firstRoute!.revision);
    page.defaultPath = "/admin/new";
    await synchronizeCollectionPageRoutes(routes, "site-a", (await collections.store.snapshot()) as never);
    const reconciled = await routes.get("site-a", reference);
    expect(reconciled).toMatchObject({
        defaultPath: "/admin/new",
        overridePath: "/admin/custom",
        path: "/admin/custom",
    });
    const overridden = await mounted.get(new Request("http://admin.test/admin/custom"));
    expect(await overridden.text()).toContain('href="/admin/content?id={{ page.id }}"');
});

test("site-owned Admin Pages use the same renderer and shared route registry", async () => {
    const routes = new InMemoryPageRouteRegistry();
    const repository = new InMemoryCmsRepository();
    await repository.insertPage("/admin/custom", "Custom administration", "<main><h1>Custom</h1></main>", {});
    const page = (await repository.getAllPages())[0]!;
    await repository.updatePage({ id: page.id, visible: true }, page.revision);
    await synchronizeSitePageRoutes(routes, "site-a", await repository.getAllPages());
    const collections = {
        siteId: "site-a",
        routes,
        store: { snapshot: async () => ({ revision: 0, collections: [] }) },
        migrations: { getActive: async () => null },
    };
    const mounted = mountPublicPages({ repository, collections: collections as never });

    const response = await mounted.get(new Request("http://admin.test/admin/custom"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Custom administration");
    expect((await mounted.kernel.content.getRenderablePage("/admin/custom"))?.source.kind).toBe("site");
});
