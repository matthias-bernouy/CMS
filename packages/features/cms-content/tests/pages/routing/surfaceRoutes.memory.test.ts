import { describe, expect, test } from "bun:test";
import {
    createPageRouteReader,
    InMemoryCmsRepository,
    InMemorySurfacePageRouteRegistry,
    PageLinkSurfaceError,
    PageRouteCollisionError,
    PageRouteRevisionConflictError,
    resolvePageLinkTarget,
    synchronizePageRoutes,
    synchronizeSitePageRoutes,
    withSitePageRoutes,
    type PageReference,
} from "@bernouy/cms-content";

const overview = {
    kind: "collection",
    publisherId: "ulvia",
    collectionId: "ulvia-control",
    pageId: "overview",
} as const satisfies PageReference;

describe("surface Page route registry", () => {
    test("keeps surface paths constrained and rejects same-surface collisions", async () => {
        const routes = new InMemorySurfacePageRouteRegistry();
        await routes.register("site-a", { page: overview, surface: "control", defaultPath: "/admin/overview" });
        await routes.register("site-a", {
            page: { kind: "site", pageId: "delivery-overview" },
            surface: "delivery",
            defaultPath: "/overview",
        });

        expect((await routes.resolve("site-a", "control", "/admin/overview"))?.page).toEqual(overview);
        expect((await routes.resolve("site-a", "delivery", "/overview"))?.page).toEqual({
            kind: "site",
            pageId: "delivery-overview",
        });
        await expect(
            routes.register("site-a", {
                page: { kind: "site", pageId: "other-control" },
                surface: "control",
                defaultPath: "/admin/overview",
            }),
        ).rejects.toThrow(PageRouteCollisionError);
        await expect(
            routes.register("site-a", {
                page: { kind: "site", pageId: "misplaced-control" },
                surface: "control",
                defaultPath: "/misplaced",
            }),
        ).rejects.toThrow("/admin");
        await expect(
            routes.register("site-a", {
                page: { kind: "site", pageId: "misplaced-delivery" },
                surface: "delivery",
                defaultPath: "/admin/misplaced",
            }),
        ).rejects.toThrow("cannot use /admin");
    });

    test("moves an untouched default but preserves a site override during upgrades", async () => {
        const routes = new InMemorySurfacePageRouteRegistry();
        const initial = await routes.register("site-a", {
            page: overview,
            surface: "control",
            defaultPath: "/admin/pages",
        });
        const moved = await routes.updateDefault("site-a", overview, "/admin/content/pages", initial.revision);
        expect(moved).toMatchObject({
            defaultPath: "/admin/content/pages",
            path: "/admin/content/pages",
            revision: 2,
        });

        const customized = await routes.setOverride("site-a", overview, "/admin/my-pages", moved.revision);
        const upgraded = await routes.updateDefault(
            "site-a",
            overview,
            "/admin/content/all-pages",
            customized.revision,
        );
        expect(upgraded).toMatchObject({
            defaultPath: "/admin/content/all-pages",
            overridePath: "/admin/my-pages",
            path: "/admin/my-pages",
        });

        const restored = await routes.setOverride("site-a", overview, null, upgraded.revision);
        expect(restored.path).toBe("/admin/content/all-pages");
        expect(restored.overridePath).toBeUndefined();
    });

    test("uses revisions for route writes", async () => {
        const routes = new InMemorySurfacePageRouteRegistry();
        await routes.register("site-a", { page: overview, surface: "control", defaultPath: "/admin/pages" });
        await routes.setOverride("site-a", overview, "/admin/content", 1);
        await expect(routes.updateDefault("site-a", overview, "/admin/new-default", 1)).rejects.toThrow(
            PageRouteRevisionConflictError,
        );
    });

    test("resolves one link model and blocks Delivery links into Control", async () => {
        const routes = new InMemorySurfacePageRouteRegistry();
        await routes.register("site-a", { page: overview, surface: "control", defaultPath: "/admin/pages" });
        const repository = new InMemoryCmsRepository();
        await repository.insertPage("/", "Home");
        const home = await repository.getPage("/");
        const delivery = { kind: "site", pageId: home!.id } as const;
        await synchronizeSitePageRoutes(routes, "site-a", await repository.getAllPages());
        const homeRoute = await routes.get("site-a", delivery);
        await routes.setOverride("site-a", delivery, "/home", homeRoute!.revision);
        const reader = createPageRouteReader(routes, "site-a");

        expect(await resolvePageLinkTarget(reader, "control", { kind: "page", page: delivery })).toEqual({
            href: "/home",
            surface: "delivery",
        });
        await expect(resolvePageLinkTarget(reader, "delivery", { kind: "page", page: overview })).rejects.toThrow(
            PageLinkSurfaceError,
        );
        await expect(
            resolvePageLinkTarget(reader, "control", { kind: "url", url: "javascript:alert(1)" }),
        ).rejects.toThrow(TypeError);
    });

    test("scopes routes by site and synchronizes editable Control Pages", async () => {
        const routes = new InMemorySurfacePageRouteRegistry();
        await routes.register("site-b", { page: overview, surface: "control", defaultPath: "/admin/shared" });
        await routes.register("site-a", { page: overview, surface: "control", defaultPath: "/admin/shared" });
        expect(await routes.resolve("site-b", "control", "/admin/shared")).not.toBeNull();

        const inner = new InMemoryCmsRepository();
        const repository = withSitePageRoutes(inner, routes, "site-a");
        await expect(repository.insertPage("/admin/shared", "Collision", "", { surface: "control" })).rejects.toThrow(
            PageRouteCollisionError,
        );
        expect(await inner.getPage("/admin/shared")).toBeNull();
        const reference = JSON.stringify(overview);
        await repository.insertPage(
            "/admin/custom",
            "Custom",
            `<main><a data-cms-page-ref='${reference}'>Overview</a></main>`,
            { surface: "control" },
        );
        const page = await repository.getPage("/admin/custom");
        expect(await routes.resolve("site-a", "control", "/admin/custom")).toMatchObject({
            page: { kind: "site", pageId: page!.id },
        });

        await synchronizeSitePageRoutes(routes, "site-a", await repository.getAllPages());
        expect((await routes.list("site-a")).filter(({ page }) => page.kind === "site")).toHaveLength(1);
        await expect(
            repository.insertPage("/broken", "Broken", `<main><a data-cms-page-ref='${reference}'>Control</a></main>`),
        ).rejects.toThrow(PageLinkSurfaceError);
    });

    test("one reconciliation removes stale ownership before reusing its path", async () => {
        const routes = new InMemorySurfacePageRouteRegistry();
        await routes.register("site-a", {
            page: { kind: "site", pageId: "removed" },
            surface: "control",
            defaultPath: "/admin/shared",
        });
        const installation = {
            collectionId: "ulvia-control",
            digest: `sha256:${"a".repeat(64)}`,
            configuration: {},
            textOverrides: {},
            release: {
                publisherId: "ulvia",
                collectionId: "ulvia-control",
                pages: [
                    {
                        id: "overview",
                        surface: "control",
                        defaultPath: "/admin/shared",
                    },
                ],
            },
        } as never;

        await synchronizePageRoutes(routes, "site-a", { collections: [installation] }, []);
        expect(await routes.resolve("site-a", "control", "/admin/shared")).toMatchObject({
            page: overview,
        });
    });

    test("one reconciliation can swap two canonical routes", async () => {
        const routes = new InMemorySurfacePageRouteRegistry();
        const first = { kind: "site", pageId: "first" } as const;
        const second = { kind: "site", pageId: "second" } as const;
        await routes.register("site-a", { page: first, surface: "delivery", defaultPath: "/first" });
        await routes.register("site-a", { page: second, surface: "delivery", defaultPath: "/second" });

        await synchronizePageRoutes(routes, "site-a", { collections: [] }, [
            { id: "first", surface: "delivery", path: "/second" },
            { id: "second", surface: "delivery", path: "/first" },
        ] as never);
        expect((await routes.get("site-a", first))?.path).toBe("/second");
        expect((await routes.get("site-a", second))?.path).toBe("/first");
    });
});
