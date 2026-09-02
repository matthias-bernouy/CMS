import { describe, expect, test } from "bun:test";
import {
    DuplicateDashboardViewError,
    InMemoryDashboardAssignmentRepository,
    InMemoryDashboardViewRepository,
    normalizeLegacyDashboardView,
    type Dashboard,
} from "@bernouy/cms-dashboards";

const dashboard = (id = "commerce"): Dashboard => ({
    id,
    source: "commerce",
    views: [
        {
            widget: "w-table",
            id: "ordersTable",
            source: { endpoint: "listOrders", itemsPath: "items" },
            rowKey: "id",
            columns: [{ id: "id", label: "ID", path: "id" }],
        },
    ],
});

describe("InMemoryDashboardRepository", () => {
    test("creates, updates, lists, and deletes dashboards", async () => {
        const repo = new InMemoryDashboardViewRepository();
        const view = normalizeLegacyDashboardView(dashboard());
        await repo.createView(view);

        expect(await repo.getView("commerce")).toEqual(view);
        expect(await repo.updateView({ ...view, meta: { name: "Commerce" } })).toEqual({
            ...view,
            meta: { name: "Commerce" },
        });
        expect(await repo.getViewsForSource("commerce")).toEqual([{ ...view, meta: { name: "Commerce" } }]);
        expect(await repo.getViewsForSource("missing")).toEqual([]);
        expect(await repo.getAllViews()).toEqual([{ ...view, meta: { name: "Commerce" } }]);
        expect(await repo.deleteView("commerce")).toBe(true);
        expect(await repo.getView("commerce")).toBeNull();
    });

    test("rejects duplicates and clones stored data", async () => {
        const repo = new InMemoryDashboardViewRepository();
        const view = normalizeLegacyDashboardView(dashboard());
        const created = await repo.createView(view);
        created.view.widgets[0]!.id = "mutated";

        await expect(repo.createView(view)).rejects.toBeInstanceOf(DuplicateDashboardViewError);
        expect(await repo.getView("commerce")).toEqual(view);
    });
});

describe("InMemoryDashboardAssignmentRepository", () => {
    test("keeps idempotent assignments and clears dashboards or subjects", async () => {
        const repo = new InMemoryDashboardAssignmentRepository();
        await repo.assign({ subjectId: "support-1", dashboardId: "support" });
        await repo.assign({ subjectId: "support-1", dashboardId: "support" });
        await repo.assign({ subjectId: "support-1", dashboardId: "operations" });
        await repo.assign({ subjectId: "support-2", dashboardId: "support" });
        expect(await repo.getDashboardIdsForSubject("support-1")).toEqual(["operations", "support"]);
        expect(await repo.getSubjectIdsForDashboard("support")).toEqual(["support-1", "support-2"]);
        expect(await repo.getAssignedSubjectIds("support", ["missing", "support-2"])).toEqual(["support-2"]);
        expect(await repo.countForDashboard("support")).toBe(2);
        expect(await repo.deleteForSubject("support-1")).toBe(2);
        expect(await repo.deleteForDashboard("support")).toBe(1);
        expect(await repo.hasAssignment("support-2", "support")).toBe(false);
    });
});
