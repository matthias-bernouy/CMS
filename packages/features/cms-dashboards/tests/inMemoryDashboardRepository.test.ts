import { describe, expect, test } from "bun:test";
import { DuplicateDashboardError, InMemoryDashboardRepository, type Dashboard } from "@bernouy/cms-dashboards";

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
        const repo = new InMemoryDashboardRepository();
        await repo.createDashboard(dashboard());

        expect(await repo.getDashboard("commerce")).toEqual(dashboard());
        expect(await repo.updateDashboard({ ...dashboard(), meta: { name: "Commerce" } })).toEqual({
            ...dashboard(),
            meta: { name: "Commerce" },
        });
        expect(await repo.getDashboardsForSource("commerce")).toEqual([{ ...dashboard(), meta: { name: "Commerce" } }]);
        expect(await repo.getDashboardsForSource("missing")).toEqual([]);
        expect(await repo.getAllDashboards()).toEqual([{ ...dashboard(), meta: { name: "Commerce" } }]);
        expect(await repo.deleteDashboard("commerce")).toBe(true);
        expect(await repo.getDashboard("commerce")).toBeNull();
    });

    test("rejects duplicates and clones stored data", async () => {
        const repo = new InMemoryDashboardRepository();
        const created = await repo.createDashboard(dashboard());
        created.views[0]!.id = "mutated";

        await expect(repo.createDashboard(dashboard())).rejects.toBeInstanceOf(DuplicateDashboardError);
        expect(await repo.getDashboard("commerce")).toEqual(dashboard());
    });
});
