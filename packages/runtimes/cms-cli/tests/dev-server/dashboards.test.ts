import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsDashboardRepository } from "cms-cli/dev-server/dashboards";
import type { Dashboard } from "@bernouy/cms-dashboards";

describe("LocalFsDashboardRepository", () => {
    test("persists dashboards across repository instances", async () => {
        const siteDir = await mkdtemp(join(tmpdir(), "p9r-dashboards-"));
        const first = new LocalFsDashboardRepository(siteDir);

        await first.createDashboard(testDashboard("orders", "commerce"));

        const second = new LocalFsDashboardRepository(siteDir);
        expect(await second.getDashboard("orders")).toEqual(testDashboard("orders", "commerce"));
        expect(await second.getDashboardsForSource("commerce")).toEqual([testDashboard("orders", "commerce")]);
        expect(await second.getAllDashboards()).toEqual([testDashboard("orders", "commerce")]);
    });

    test("updates and deletes dashboards", async () => {
        const siteDir = await mkdtemp(join(tmpdir(), "p9r-dashboards-"));
        const repo = new LocalFsDashboardRepository(siteDir);

        await repo.createDashboard(testDashboard("orders", "commerce"));
        await repo.updateDashboard(testDashboard("orders", "crm"));

        expect(await repo.getDashboardsForSource("commerce")).toEqual([]);
        expect(await repo.getDashboardsForSource("crm")).toEqual([testDashboard("orders", "crm")]);
        expect(await repo.deleteDashboard("orders")).toBe(true);
        expect(await repo.getAllDashboards()).toEqual([]);
    });
});

function testDashboard(id: string, source: string): Dashboard {
    return {
        id,
        source,
        collections: [{ id: "items", list: { endpoint: "list" } }],
        views: [{ widget: "w-table", collection: "items" }],
    };
}
