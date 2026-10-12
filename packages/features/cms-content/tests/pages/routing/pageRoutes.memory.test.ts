import { describe, expect, test } from "bun:test";
import {
    createPageRouteReader,
    InMemoryPageRouteRegistry,
    PageRouteCollisionError,
    PageRouteRevisionConflictError,
    resolvePageLinkTarget,
    synchronizePageRouteRegistrations,
    type PageReference,
} from "@bernouy/cms-content";

const overview = {
    kind: "contribution",
    sourceId: "ulvia",
    contributionId: "ulvia-official",
    pageId: "overview",
} as const satisfies PageReference;

describe("Page route registry", () => {
    test("uses one path namespace per site", async () => {
        const routes = new InMemoryPageRouteRegistry();
        await routes.register("site-a", { page: overview, defaultPath: "/admin/pages" });
        expect((await routes.resolve("site-a", "/admin/pages"))?.page).toEqual(overview);
        await expect(
            routes.register("site-a", {
                page: { kind: "site", pageId: "other" },
                defaultPath: "/admin/pages",
            }),
        ).rejects.toThrow(PageRouteCollisionError);
        expect(await routes.resolve("site-b", "/admin/pages")).toBeNull();
    });

    test("moves defaults while preserving explicit overrides", async () => {
        const routes = new InMemoryPageRouteRegistry();
        const initial = await routes.register("site", { page: overview, defaultPath: "/pages" });
        const moved = await routes.updateDefault("site", overview, "/content/pages", initial.revision);
        const customized = await routes.setOverride("site", overview, "/my-pages", moved.revision);
        const upgraded = await routes.updateDefault("site", overview, "/content/all", customized.revision);
        expect(upgraded).toMatchObject({ defaultPath: "/content/all", path: "/my-pages" });
        const restored = await routes.setOverride("site", overview, null, upgraded.revision);
        expect(restored.path).toBe("/content/all");
    });

    test("uses revisions for writes", async () => {
        const routes = new InMemoryPageRouteRegistry();
        await routes.register("site", { page: overview, defaultPath: "/pages" });
        await routes.setOverride("site", overview, "/content", 1);
        await expect(routes.updateDefault("site", overview, "/new", 1)).rejects.toThrow(PageRouteRevisionConflictError);
    });

    test("resolves stable Page links without a surface dimension", async () => {
        const routes = new InMemoryPageRouteRegistry();
        await routes.register("site", { page: overview, defaultPath: "/admin/pages" });
        const reader = createPageRouteReader(routes, "site");
        expect(await resolvePageLinkTarget(reader, { kind: "page", page: overview })).toEqual({
            href: "/admin/pages",
            external: false,
        });
        await expect(resolvePageLinkTarget(reader, { kind: "url", url: "javascript:alert(1)" })).rejects.toThrow(
            TypeError,
        );
    });

    test("reconciles route swaps", async () => {
        const routes = new InMemoryPageRouteRegistry();
        const first = { kind: "site", pageId: "first" } as const;
        const second = { kind: "site", pageId: "second" } as const;
        await routes.register("site", { page: first, defaultPath: "/first" });
        await routes.register("site", { page: second, defaultPath: "/second" });
        await synchronizePageRouteRegistrations(
            routes,
            "site",
            [
                { page: first, defaultPath: "/second" },
                { page: second, defaultPath: "/first" },
            ],
            () => true,
        );
        expect((await routes.get("site", first))?.path).toBe("/second");
        expect((await routes.get("site", second))?.path).toBe("/first");
    });
});
