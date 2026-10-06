import { describe, expect, test } from "bun:test";
import {
    createPageRouteReader,
    InMemoryCmsRepository,
    InMemorySurfacePageRouteRegistry,
    PageLinkSurfaceError,
    PageRouteCollisionError,
    PageRouteRevisionConflictError,
    resolvePageLinkTarget,
    type PageReference,
} from "@bernouy/cms-content";

const overview = {
    kind: "collection",
    publisherId: "ulvia",
    collectionId: "ulvia-control",
    pageId: "overview",
} as const satisfies PageReference;

describe("surface Page route registry", () => {
    test("isolates identical paths by surface and rejects same-surface collisions", async () => {
        const routes = new InMemorySurfacePageRouteRegistry();
        await routes.register({ page: overview, surface: "control", defaultPath: "/overview" });
        await routes.register({
            page: { kind: "site", pageId: "delivery-overview" },
            surface: "delivery",
            defaultPath: "/overview",
        });

        expect((await routes.resolve("control", "/overview"))?.page).toEqual(overview);
        expect((await routes.resolve("delivery", "/overview"))?.page).toEqual({
            kind: "site",
            pageId: "delivery-overview",
        });
        await expect(
            routes.register({
                page: { kind: "site", pageId: "other-control" },
                surface: "control",
                defaultPath: "/overview",
            }),
        ).rejects.toThrow(PageRouteCollisionError);
    });

    test("moves an untouched default but preserves a site override during upgrades", async () => {
        const routes = new InMemorySurfacePageRouteRegistry();
        const initial = await routes.register({ page: overview, surface: "control", defaultPath: "/pages" });
        const moved = await routes.updateDefault(overview, "/content/pages", initial.revision);
        expect(moved).toMatchObject({ defaultPath: "/content/pages", path: "/content/pages", revision: 2 });

        const customized = await routes.setOverride(overview, "/my-pages", moved.revision);
        const upgraded = await routes.updateDefault(overview, "/content/all-pages", customized.revision);
        expect(upgraded).toMatchObject({
            defaultPath: "/content/all-pages",
            overridePath: "/my-pages",
            path: "/my-pages",
        });

        const restored = await routes.setOverride(overview, null, upgraded.revision);
        expect(restored.path).toBe("/content/all-pages");
        expect(restored.overridePath).toBeUndefined();
    });

    test("uses revisions for route writes", async () => {
        const routes = new InMemorySurfacePageRouteRegistry();
        await routes.register({ page: overview, surface: "control", defaultPath: "/pages" });
        await routes.setOverride(overview, "/content", 1);
        await expect(routes.updateDefault(overview, "/new-default", 1)).rejects.toThrow(PageRouteRevisionConflictError);
    });

    test("resolves one link model and blocks Delivery links into Control", async () => {
        const routes = new InMemorySurfacePageRouteRegistry();
        await routes.register({ page: overview, surface: "control", defaultPath: "/pages" });
        const repository = new InMemoryCmsRepository();
        await repository.insertPage("/", "Home");
        const home = await repository.getPage("/");
        const delivery = { kind: "site", pageId: home!.id } as const;
        const reader = createPageRouteReader(repository, routes);

        expect(await resolvePageLinkTarget(reader, "control", { kind: "page", page: delivery })).toEqual({
            href: "/",
            surface: "delivery",
        });
        await expect(resolvePageLinkTarget(reader, "delivery", { kind: "page", page: overview })).rejects.toThrow(
            PageLinkSurfaceError,
        );
        await expect(
            resolvePageLinkTarget(routes, "control", { kind: "url", url: "javascript:alert(1)" }),
        ).rejects.toThrow(TypeError);
    });
});
