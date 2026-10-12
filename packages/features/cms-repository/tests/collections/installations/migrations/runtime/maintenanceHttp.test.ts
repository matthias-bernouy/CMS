import { describe, expect, test } from "bun:test";
import { createCollectionMaintenanceGuard } from "@bernouy/cms-repository/collections/http";

const guard = createCollectionMaintenanceGuard({
    basePath: "/cms",
    siteId: "site",
    migrations: { getActive: async () => ({ id: "migration", status: "migrating" }) },
});
const next = async () => new Response("available");

describe("collection migration maintenance HTTP guard", () => {
    test("returns an uncached service-unavailable response for Pages", async () => {
        const response = await guard(new Request("https://site.test/cms/page"), next);

        expect(response.status).toBe(503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("retry-after")).toBe("60");
        expect(await response.json()).toEqual({
            code: "site_maintenance",
            migrationId: "migration",
            status: "migrating",
        });
    });

    test("keeps login, authentication and immutable assets available", async () => {
        for (const path of [
            "/login",
            "/.cms/auth/methods",
            "/.cms/public-auth/me",
            "/.cms/assets/component.js",
            "/.cms/collections/official/assets/logo",
            "/.cms/blocset",
            "/.cms/style",
            "/favicon.ico",
        ]) {
            expect((await guard(new Request(`https://site.test/cms${path}`), next)).status).toBe(200);
        }
    });

    test("keeps recovery and diagnostic capabilities available", async () => {
        for (const capability of [
            "ulvia.cms.collections/get-migration",
            "ulvia.cms.collections/migration-status",
            "ulvia.cms.collections/resume-migration",
            "ulvia.cms.collections/rollback-migration",
            "ulvia.cms.jobs/get",
            "ulvia.cms.jobs/list",
        ]) {
            const response = await guard(
                new Request(`https://site.test/cms/.cms/call/${capability}`, { method: "POST" }),
                next,
            );
            expect(response.status).toBe(200);
        }
    });

    test("fences other capabilities with a locked response", async () => {
        const response = await guard(
            new Request("https://site.test/cms/.cms/call/ulvia.cms.pages/create", { method: "POST" }),
            next,
        );
        expect(response.status).toBe(423);
        expect(response.headers.get("cache-control")).toBe("no-store");
    });
});
