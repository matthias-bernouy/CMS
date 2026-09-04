import { describe, expect, test } from "bun:test";
import {
    DASHBOARD_SCHEMA_VERSION,
    compileDashboardExecutionPlan,
    normalizeLegacyDashboardView,
    resolveDashboardViews,
    validateDashboardStructure,
    validateDashboardViewStructure,
    type Dashboard,
    type DashboardDefinition,
    type DashboardViewDefinition,
} from "@bernouy/cms-dashboards";
import { InMemorySourceRepository } from "@bernouy/cms-sources";

const legacyView = (): Dashboard => ({
    id: "orders",
    source: "commerce",
    views: [
        {
            widget: "w-table",
            id: "ordersTable",
            source: { endpoint: "listOrders" },
            rowKey: "id",
            columns: [{ id: "id", label: "ID", path: "id" }],
            actions: [{ id: "refund", label: "Refund", endpoint: { endpoint: "refundOrder" } }],
        },
    ],
});

const dashboard = (): DashboardDefinition => ({
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    id: "support",
    meta: { name: "Support" },
    homeView: "operations/orders",
    views: [
        {
            id: "operations",
            label: "Operations",
            children: [{ id: "orders", use: "orders" }],
        },
    ],
    origin: { kind: "site", createdBy: "admin-1" },
    status: "published",
    revision: "2",
});

describe("dashboard V2 composition", () => {
    test("accepts an empty dashboard before its navigation is configured", async () => {
        const empty = { ...dashboard(), homeView: "", views: [] };
        expect(validateDashboardStructure(empty)).toEqual([]);
        const resolved = resolveDashboardViews(empty, []).dashboard!;
        expect(await compileDashboardExecutionPlan(resolved, new InMemorySourceRepository())).toEqual({
            plan: { dashboardId: "support", revision: "2", allowedCalls: [] },
            errors: [],
        });
        expect(validateDashboardStructure({ ...empty, homeView: "orders" })).toEqual([
            expect.stringContaining("must be empty"),
        ]);
        expect(
            validateDashboardStructure({
                ...empty,
                homeView: "operations",
                views: [{ id: "operations", label: "Operations" }],
            }),
        ).toEqual([]);
    });

    test("normalizes V1 artifacts and resolves a three-level navigation tree", () => {
        const view = normalizeLegacyDashboardView(legacyView());
        expect(view.schemaVersion).toBe(2);
        expect(view.view.widgets).toHaveLength(1);
        expect(validateDashboardStructure(dashboard())).toEqual([]);
        const resolved = resolveDashboardViews(dashboard(), [view]);
        expect(resolved.errors).toEqual([]);
        expect(resolved.dashboard?.views[0]?.children[0]).toMatchObject({
            id: "orders",
            source: "commerce",
            viewId: "orders",
        });
    });

    test("rejects missing home paths and navigation deeper than three levels", () => {
        const invalid = dashboard();
        invalid.homeView = "missing";
        invalid.views[0]!.children![0]!.children = [
            { id: "third", children: [{ id: "fourth", use: "orders" }], label: "Third" },
        ];
        expect(validateDashboardStructure(invalid)).toEqual(
            expect.arrayContaining([
                expect.stringContaining("maximum view depth"),
                expect.stringContaining("unknown view path"),
            ]),
        );
    });

    test("accepts namespaced views at exactly three levels and validates nested widgets", () => {
        const view: DashboardViewDefinition = {
            ...normalizeLegacyDashboardView(legacyView()),
            id: "commerce/orders.support",
            view: {
                id: "orders",
                label: "Orders",
                widgets: legacyView().views,
                children: [{ id: "queue", label: "Queue", widgets: [{ widget: "unknown" } as any] }],
            },
        };
        expect(validateDashboardViewStructure(view)).toEqual(
            expect.arrayContaining([expect.stringContaining("widget is not supported")]),
        );
        view.view.children = undefined;
        expect(validateDashboardViewStructure(view)).toEqual([]);
        const exact = dashboard();
        exact.homeView = "operations/support/orders";
        exact.views = [
            {
                id: "operations",
                label: "Operations",
                children: [
                    {
                        id: "support",
                        label: "Support",
                        children: [{ id: "orders", use: "commerce/orders.support" }],
                    },
                ],
            },
        ];
        expect(validateDashboardStructure(exact)).toEqual([]);
    });

    test("compiles exact calls and refuses system endpoints", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource({
            urn: "urn:commerce",
            endpoints: [
                { urn: "urn:commerce:listOrders", method: "GET", targetUrl: "https://example.test/orders" },
                { urn: "urn:commerce:refundOrder", method: "POST", targetUrl: "https://example.test/refund" },
            ],
        });
        const resolved = resolveDashboardViews(dashboard(), [normalizeLegacyDashboardView(legacyView())]).dashboard!;
        expect(await compileDashboardExecutionPlan(resolved, sources)).toEqual({
            plan: {
                dashboardId: "support",
                revision: "2",
                allowedCalls: [
                    { sourceId: "commerce", endpointId: "listOrders", method: "GET" },
                    { sourceId: "commerce", endpointId: "refundOrder", method: "POST" },
                ],
            },
            errors: [],
        });

        await sources.updateSource({
            urn: "urn:commerce",
            endpoints: [
                { urn: "urn:commerce:listOrders", method: "GET", targetUrl: "https://example.test/orders" },
                {
                    urn: "urn:commerce:refundOrder",
                    method: "POST",
                    targetUrl: "https://example.test/refund",
                    access: { mode: "system" },
                },
            ],
        });
        expect((await compileDashboardExecutionPlan(resolved, sources)).errors).toEqual([
            expect.stringContaining("cannot be delegated"),
        ]);
    });
});
