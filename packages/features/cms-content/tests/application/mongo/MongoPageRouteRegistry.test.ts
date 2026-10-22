import { describe, expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoPageRouteRegistry } from "@bernouy/cms-content/mongo";
import { PageRouteRevisionConflictError } from "@bernouy/cms-content";
import { FakeContentDb } from "./contentMongoFixture";

describe("MongoPageRouteRegistry", () => {
    test("creates a unique path index and moves routes with revision CAS", async () => {
        const db = new FakeContentDb();
        const routes = new MongoPageRouteRegistry(db as unknown as Db, "test_");
        const page = { kind: "site", pageId: "home" } as const;

        const created = await routes.register("site-a", { page, defaultPath: "/" });
        const customized = await routes.setOverride("site-a", page, "/welcome", created.revision);

        expect(db.get("test_cms_page_routes").indexes).toContainEqual({
            keys: { routeKey: 1 },
            options: { unique: true },
        });
        expect(db.get("test_cms_page_routes").indexes).toContainEqual({
            keys: { siteId: 1, claimKeys: 1 },
            options: { unique: true },
        });
        expect(await routes.resolve("site-a", "/")).toMatchObject({ page, path: "/welcome" });
        expect(await routes.resolve("site-a", "/welcome")).toMatchObject({ page, revision: 2 });
        await expect(routes.updateDefault("site-a", page, "/home", 1)).rejects.toThrow(PageRouteRevisionConflictError);
        expect(customized.overridePath).toBe("/welcome");
    });

    test("keeps absent overrides absent across successive default path updates", async () => {
        const db = new FakeContentDb();
        const routes = new MongoPageRouteRegistry(db as unknown as Db, "test_");
        const page = { kind: "site", pageId: "about" } as const;

        const created = await routes.register("site-a", { page, defaultPath: "/about" });
        const first = await routes.updateDefault("site-a", page, "/company", created.revision);
        const collection = db.get("test_cms_page_routes");
        expect(collection.replaceOneCalls.at(-1)?.document).not.toHaveProperty("overridePath");

        await collection.updateOne({ defaultPath: "/company" }, { $set: { overridePath: null } });
        const second = await routes.updateDefault("site-a", page, "/studio", first.revision);

        expect(second).toMatchObject({ defaultPath: "/studio", path: "/studio", revision: 3 });
        expect(second).not.toHaveProperty("overridePath");
        expect(collection.replaceOneCalls.at(-1)?.document).not.toHaveProperty("overridePath");
    });
});
