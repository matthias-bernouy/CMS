import { expect, test } from "bun:test";
import {
    InMemoryCmsRepository,
    InMemorySurfacePageRouteRegistry,
    synchronizeCollectionPageRoutes,
} from "@bernouy/cms-content";
import { InMemoryCache } from "@bernouy/http-runner";
import { handleControlPage } from "cms-control/core/admin/control/mountRoutes/pages";
import {
    collectionPageReference,
    controlPageSnapshot,
} from "cms-control/core/admin/control/mountRoutes/pages/registry";
import type { ControlCmsState } from "cms-control/core/admin/control/types";

test("collection Control Pages render through site routes while preserving path overrides", async () => {
    const routes = new InMemorySurfacePageRouteRegistry();
    const page = {
        id: "pages",
        generation: 1,
        surface: "control" as const,
        defaultPath: "/admin",
        name: "page.pages.name",
        uses: [],
        requires: [],
        document: {
            html: `<section><h1>Collection Pages</h1><a data-cms-page-ref='{"kind":"collection","publisherId":"ulvia.official","collectionId":"official","pageId":"details"}' data-cms-page-suffix="?id={{ page.id }}">Details</a></section>`,
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
    const state = {
        runner: { basePath: "/" },
        repository: new InMemoryCmsRepository(),
        cache: new InMemoryCache(),
        configuration: {
            collections: {
                siteId: "site-a",
                routes,
                store: { snapshot: async () => ({ revision: 4, collections: [installation] }) },
            },
        },
    } as unknown as ControlCmsState;
    await synchronizeCollectionPageRoutes(routes, await state.configuration.collections!.store.snapshot("site-a"));

    const response = await handleControlPage(new Request("http://control.test/admin"), state);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Collection Pages");
    expect(html).toContain('href="/admin/pages?id={{ page.id }}"');
    expect(html).not.toContain("data-cms-page-ref");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");

    const first = await controlPageSnapshot(state);
    const reference = collectionPageReference(installation as never, page);
    const detailsReference = collectionPageReference(installation as never, details);
    const detailsRoute = await routes.get(detailsReference);
    await routes.setOverride(detailsReference, "/admin/content", detailsRoute!.revision);
    await routes.setOverride(reference, "/admin/custom", first!.pages[0]!.route.revision);
    page.defaultPath = "/admin/new";
    await synchronizeCollectionPageRoutes(routes, await state.configuration.collections!.store.snapshot("site-a"));
    const reconciled = await controlPageSnapshot(state);
    expect(reconciled!.pages.find(({ page: item }) => item.id === "pages")!.route).toMatchObject({
        defaultPath: "/admin/new",
        overridePath: "/admin/custom",
        path: "/admin/custom",
    });
    const overridden = await handleControlPage(new Request("http://control.test/admin/custom"), state);
    expect(await overridden.text()).toContain('href="/admin/content?id={{ page.id }}"');
});
