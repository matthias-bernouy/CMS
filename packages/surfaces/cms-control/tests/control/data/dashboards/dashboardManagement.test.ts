import { describe, expect, test } from "bun:test";
import {
    DASHBOARD_SCHEMA_VERSION,
    InMemoryDashboardAssignmentRepository,
    InMemoryDashboardRepository,
    InMemoryDashboardViewRepository,
    normalizeLegacyDashboardView,
} from "@bernouy/cms-dashboards";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { parseDashboardInput } from "cms-control/core/admin/dashboards/input";
import { dashboardManagementPresentation } from "cms-control/core/admin/dashboards/presentation";
import {
    createSiteDashboard,
    deleteSiteDashboard,
    updateSiteDashboard,
} from "cms-control/core/admin/dashboards/service";

describe("dashboard management", () => {
    test("accepts namespaced installed views and rejects custom or malformed input", () => {
        expect(
            parseDashboardInput({
                name: "Support",
                icon: "headphones",
                views: [{ id: "orders", use: "commerce/orders.support" }],
            }),
        ).toMatchObject({ id: "support", icon: "headphones", homeView: "orders" });
        expect(() => parseDashboardInput({ name: "Support", views: [{ id: "orders", use: "../private" }] })).toThrow(
            /safe view identifier/,
        );
        expect(() =>
            parseDashboardInput({
                name: "Support",
                views: [{ id: "orders", use: "orders", widgets: [] }],
            }),
        ).toThrow(/not supported/);
        expect(() => parseDashboardInput({ name: "Support", views: [{ id: "orders", children: {} }] })).toThrow(
            /must be an array/,
        );
        expect(() =>
            parseDashboardInput({ name: "Support", views: [{ id: "orders", use: "orders" }], role: "admin" }),
        ).toThrow(/not supported/);
    });

    test("enforces lower, upper, count, and three-level boundaries", () => {
        expect(() => parseDashboardInput({ name: "", views: [] })).toThrow(/name/);
        expect(parseDashboardInput({ name: "a".repeat(16) }).name).toHaveLength(16);
        expect(() => parseDashboardInput({ name: "a".repeat(17) })).toThrow(/at most 16/);
        expect(
            parseDashboardInput({
                name: "Labels",
                views: [{ id: "group", label: "a".repeat(16), children: [] }],
            }).views[0]?.label,
        ).toHaveLength(16);
        expect(() =>
            parseDashboardInput({
                name: "Labels",
                views: [{ id: "group", label: "a".repeat(17), children: [] }],
            }),
        ).toThrow(/views\.0\.label.*at most 16/);
        expect(() =>
            parseDashboardInput({
                name: "Labels",
                views: [{ id: "orders", label: "a".repeat(17), use: "orders" }],
            }),
        ).toThrow(/views\.0\.label.*at most 16/);
        expect(parseDashboardInput({ name: "Empty" })).toMatchObject({
            id: "empty",
            homeView: "",
            views: [],
        });
        expect(() => parseDashboardInput({ name: "Empty", views: "orders" })).toThrow(/must be an array/);
        expect(() => parseDashboardInput({ name: "Empty", homeView: "orders" })).toThrow(/must be empty/);
        expect(
            parseDashboardInput({ name: "Grouped", views: [{ id: "operations", label: "Operations" }] }),
        ).toMatchObject({ homeView: "operations", views: [{ id: "operations", label: "Operations" }] });
        expect(parseDashboardInput({ name: "A", views: [{ id: "a", use: "orders" }] }).views).toHaveLength(1);
        expect(parseDashboardInput({ name: "Bound form", views: '[{"id":"orders","use":"orders"}]' }).views).toEqual([
            { id: "orders", use: "orders" },
        ]);
        const oneHundred = Array.from({ length: 100 }, (_, index) => ({ id: `v-${index}`, use: "orders" }));
        expect(parseDashboardInput({ name: "Maximum", views: oneHundred }).views).toHaveLength(100);
        expect(() =>
            parseDashboardInput({
                name: "Too many",
                views: [...oneHundred, { id: "overflow", use: "orders" }],
            }),
        ).toThrow(/100/);
        expect(
            parseDashboardInput({
                name: "Three",
                views: [
                    {
                        id: "one",
                        label: "One",
                        children: [{ id: "two", label: "Two", children: [{ id: "three", use: "orders" }] }],
                    },
                ],
            }).homeView,
        ).toBe("one/two/three");
        expect(() =>
            parseDashboardInput({
                name: "Four",
                views: [
                    {
                        id: "one",
                        children: [
                            { id: "two", children: [{ id: "three", children: [{ id: "four", use: "orders" }] }] },
                        ],
                    },
                ],
            }),
        ).toThrow(/three navigation levels/);
    });

    test("creates and atomically updates active dashboards, then deletes assignments", async () => {
        const fixture = await managementFixture();
        const created = await createSiteDashboard(fixture.cms, parseDashboardInput({ name: "Support" }), "admin-1");
        expect(created).toMatchObject({
            id: "support",
            meta: { name: "Support", icon: "layout" },
            homeView: "",
            status: "published",
            revision: "1",
            views: [],
        });
        expect(created.executionPlan?.allowedCalls).toEqual([]);

        const input = parseDashboardInput({
            name: "Support",
            icon: "headphones",
            views: [{ id: "orders", label: "Order queue", icon: "receipt", use: "commerce/orders" }],
        });
        const updated = await updateSiteDashboard(fixture.cms, created.id, input);
        expect(updated).toMatchObject({
            meta: { name: "Support", icon: "headphones" },
            status: "published",
            revision: "2",
            views: [{ id: "orders", label: "Order queue", icon: "receipt", use: "commerce/orders" }],
        });
        expect(updated.executionPlan?.allowedCalls).toEqual([
            { sourceId: "commerce", endpointId: "listOrders", method: "GET" },
        ]);
        await fixture.assignments.assign({ subjectId: "support-1", dashboardId: updated.id });
        expect(await deleteSiteDashboard(fixture.cms, created.id)).toBe(true);
        expect(await fixture.assignments.hasAssignment("support-1", created.id)).toBe(false);
    });

    test("refuses to create a dashboard that delegates a system endpoint", async () => {
        const fixture = await managementFixture("system");
        await expect(
            createSiteDashboard(
                fixture.cms,
                parseDashboardInput({ name: "Unsafe", views: [{ id: "orders", use: "commerce/orders" }] }),
                "admin-1",
            ),
        ).rejects.toThrow(/cannot be delegated/);
        expect(await fixture.dashboards.getAllDashboards()).toEqual([]);
    });

    test("keeps the previous active revision when an update cannot compile", async () => {
        const fixture = await managementFixture();
        const input = parseDashboardInput({
            name: "Support",
            views: [{ id: "orders", use: "commerce/orders" }],
        });
        const created = await createSiteDashboard(fixture.cms, input, "admin-1");
        const source = await fixture.sources.getSource("urn:commerce");
        source!.endpoints[0]!.access = { mode: "system" };
        await fixture.sources.updateSource(source!);

        await expect(updateSiteDashboard(fixture.cms, created.id, { ...input, name: "Unsafe update" })).rejects.toThrow(
            /cannot be delegated/,
        );
        expect(await fixture.dashboards.getDashboard(created.id)).toEqual(created);
    });

    test("presents site and integration dashboards for the bound admin page", async () => {
        const fixture = await managementFixture();
        await createSiteDashboard(fixture.cms, parseDashboardInput({ name: "Support" }), "admin-1");
        await fixture.dashboards.createDashboard({
            schemaVersion: DASHBOARD_SCHEMA_VERSION,
            id: "commerce",
            meta: { name: "Commerce", icon: "store" },
            homeView: "",
            views: [],
            origin: { kind: "integration", integrationId: "commerce", version: "1.0.0" },
            status: "published",
            revision: "1",
        });

        const model = await dashboardManagementPresentation(fixture.cms, "commerce");

        expect(model.site).toEqual([expect.objectContaining({ id: "support", name: "Support", selected: false })]);
        expect(model.integrations).toEqual([
            expect.objectContaining({ id: "commerce", name: "Commerce", selected: true }),
        ]);
        expect(model.selected[0]).toMatchObject({
            id: "commerce",
            editable: false,
            managed: true,
            ownerLabel: "commerce 1.0.0",
        });
        expect(model.selected[0]?.openActions).toHaveLength(1);
        expect(model.emptyState).toEqual([]);
    });
});

async function managementFixture(access: "admin" | "system" = "admin") {
    const dashboards = new InMemoryDashboardRepository();
    const dashboardViews = new InMemoryDashboardViewRepository();
    const assignments = new InMemoryDashboardAssignmentRepository();
    const sources = new InMemorySourceRepository();
    await sources.createSource({
        urn: "urn:commerce",
        endpoints: [
            {
                urn: "urn:commerce:listOrders",
                method: "GET",
                targetUrl: "data:application/json,%7B%22items%22%3A%5B%5D%7D",
                access: { mode: access },
            },
        ],
    });
    await dashboardViews.createView({
        ...normalizeLegacyDashboardView({
            id: "commerce/orders",
            source: "commerce",
            views: [
                {
                    widget: "w-table",
                    id: "orders",
                    source: { endpoint: "listOrders", itemsPath: "items" },
                    rowKey: "id",
                    columns: [{ id: "id", label: "ID", path: "id" }],
                },
            ],
        }),
        revision: "view-1",
    });
    return {
        assignments,
        dashboards,
        sources,
        cms: { dashboards, dashboardViews, dashboardAssignments: assignments, sources } as any,
    };
}
