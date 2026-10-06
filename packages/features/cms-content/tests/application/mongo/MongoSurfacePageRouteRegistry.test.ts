import { describe, expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoSurfacePageRouteRegistry } from "@bernouy/cms-content/mongo";
import { PageRouteRevisionConflictError } from "@bernouy/cms-content";
import { FakeContentDb } from "./contentMongoFixture";

describe("MongoSurfacePageRouteRegistry", () => {
    test("creates a unique surface-path index and moves routes with revision CAS", async () => {
        const db = new FakeContentDb();
        const routes = new MongoSurfacePageRouteRegistry(db as unknown as Db, "test_");
        const page = { kind: "site", pageId: "home" } as const;

        const created = await routes.register("site-a", { page, surface: "delivery", defaultPath: "/" });
        const customized = await routes.setOverride("site-a", page, "/welcome", created.revision);

        expect(db.get("test_cms_surface_page_routes").indexes).toContainEqual({
            keys: { routeKey: 1 },
            options: { unique: true },
        });
        expect(await routes.resolve("site-a", "delivery", "/")).toBeNull();
        expect(await routes.resolve("site-a", "delivery", "/welcome")).toMatchObject({ page, revision: 2 });
        await expect(routes.updateDefault("site-a", page, "/home", 1)).rejects.toThrow(PageRouteRevisionConflictError);
        expect(customized.overridePath).toBe("/welcome");
    });
});
