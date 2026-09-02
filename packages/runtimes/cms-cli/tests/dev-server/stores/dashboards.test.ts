import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    DASHBOARD_SCHEMA_VERSION,
    normalizeLegacyDashboardView,
    type Dashboard,
    type DashboardDefinition,
} from "@bernouy/cms-dashboards";
import {
    LocalFsDashboardAssignmentRepository,
    LocalFsDashboardRepository,
    LocalFsDashboardViewRepository,
} from "cms-cli/dev-server/stores/dashboards";

describe("local dashboard stores", () => {
    test("persists composed dashboards across repository instances", async () => {
        const siteDir = await temporarySite();
        const first = new LocalFsDashboardRepository(siteDir);
        await first.createDashboard(composedDashboard());

        const second = new LocalFsDashboardRepository(siteDir);
        expect(await second.getDashboard("support")).toEqual(composedDashboard());
        expect(await second.getAllDashboards()).toEqual([composedDashboard()]);
        expect(await second.updateDashboard({ ...composedDashboard(), meta: { name: "Support desk" } })).toMatchObject({
            meta: { name: "Support desk" },
        });
        expect(await second.deleteDashboard("support")).toBe(true);
        expect(await second.getAllDashboards()).toEqual([]);
    });

    test("persists V2 views and reads the legacy file without writing it", async () => {
        const siteDir = await temporarySite();
        const generated = join(siteDir, ".p9r/generated");
        await mkdir(generated, { recursive: true });
        await writeFile(join(generated, "dashboards.json"), JSON.stringify([legacyDashboard()]));
        const views = new LocalFsDashboardViewRepository(siteDir);
        expect(await views.getView("orders")).toEqual(normalizeLegacyDashboardView(legacyDashboard()));

        const normalized = { ...normalizeLegacyDashboardView(legacyDashboard()), revision: "view-1" };
        await views.updateView(normalized);
        const reloaded = new LocalFsDashboardViewRepository(siteDir);
        expect(await reloaded.getView("orders")).toEqual(normalized);
        expect(await reloaded.getViewsForSource("commerce")).toEqual([normalized]);
    });

    test("persists idempotent assignments and supports bounded membership reads", async () => {
        const siteDir = await temporarySite();
        const assignments = new LocalFsDashboardAssignmentRepository(siteDir);
        await assignments.assign({ subjectId: "support-1", dashboardId: "support" });
        await assignments.assign({ subjectId: "support-1", dashboardId: "support" });
        await assignments.assign({ subjectId: "support-2", dashboardId: "support" });
        await assignments.assign({ subjectId: "support-1", dashboardId: "sales" });

        const reloaded = new LocalFsDashboardAssignmentRepository(siteDir);
        expect(await reloaded.getDashboardIdsForSubject("support-1")).toEqual(["sales", "support"]);
        expect(await reloaded.getSubjectIdsForDashboard("support")).toEqual(["support-1", "support-2"]);
        expect(await reloaded.getAssignedSubjectIds("support", ["missing", "support-2"])).toEqual(["support-2"]);
        expect(await reloaded.countForDashboard("support")).toBe(2);
        expect(await reloaded.deleteForSubject("support-1")).toBe(2);
        expect(await reloaded.deleteForDashboard("support")).toBe(1);
        expect(await reloaded.hasAssignment("support-2", "support")).toBe(false);
    });
});

async function temporarySite(): Promise<string> {
    return await mkdtemp(join(tmpdir(), "p9r-dashboards-"));
}

function composedDashboard(): DashboardDefinition {
    return {
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        id: "support",
        meta: { name: "Support" },
        homeView: "orders",
        views: [{ id: "orders", use: "orders", revision: "view-1" }],
        origin: { kind: "site", createdBy: "admin-1" },
        status: "published",
        revision: "2",
    };
}

function legacyDashboard(): Dashboard {
    return {
        id: "orders",
        source: "commerce",
        views: [
            {
                widget: "w-table",
                id: "itemsTable",
                source: { endpoint: "list", itemsPath: "items" },
                rowKey: "id",
                columns: [{ id: "id", label: "ID", path: "id" }],
            },
        ],
    };
}
