import { describe, expect, test } from "bun:test";
import { applyDashboardSourceOverlays, validateDashboard, type Dashboard } from "@bernouy/cms-dashboards";
import { applySourceOverlays } from "@bernouy/cms-sources";
import { dashboard, source, sourceOverlay } from "./helpers/sourceOverlayDashboardFixtures";

describe("dashboard source overlay", () => {
    test("adds dashboard columns, detail fields, and action body bindings", () => {
        const enrichedDashboard = applyDashboardSourceOverlays(dashboard, [sourceOverlay]);
        const table = enrichedDashboard.views[0] as Extract<Dashboard["views"][number], { widget: "w-table" }>;
        const detail = enrichedDashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;

        expect(table.columns).toContainEqual({ id: "company", label: "Company", path: "metadata.company" });
        expect(detail.main[0]?.id).toBe("accountFields");
        expect(detail.main[0]?.fields).toContainEqual({
            id: "company",
            label: "Company",
            path: "metadata.company",
            type: "text",
        });
        expect(detail.actions?.[0]?.endpoint?.body).toMatchObject({
            displayName: "$field.displayName",
            "metadata.company": "$field.company",
        });

        const enrichedSource = applySourceOverlays(source, [sourceOverlay]);
        expect(validateDashboard(enrichedDashboard, { source: enrichedSource })).toEqual([]);
    });

    test("overrides an existing dashboard detail field", () => {
        const enrichedDashboard = applyDashboardSourceOverlays(dashboard, [
            {
                id: "account-lookup",
                sourceId: "user-account",
                fields: [],
                dashboardFields: [
                    {
                        dashboardId: "user-account-users",
                        viewId: "accountDetail",
                        fieldId: "displayName",
                        field: {
                            label: "Account",
                            type: "combobox",
                            lookup: {
                                endpoint: "listAccounts",
                                itemsPath: "accounts",
                                valuePath: "userId",
                                labelPath: "displayName",
                                selected: "$resource.account",
                            },
                        },
                    },
                ],
            },
        ]);
        const detail = enrichedDashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;

        expect(detail.main[0]?.fields[0]).toMatchObject({
            id: "displayName",
            label: "Account",
            type: "combobox",
            lookup: {
                endpoint: "listAccounts",
                selected: "$resource.account",
            },
        });
        expect(validateDashboard(enrichedDashboard, { source })).toEqual([]);
    });

    test("renders overlay fields with options as selects", () => {
        const overlayWithOptions = {
            ...sourceOverlay,
            fields: [
                {
                    id: "accountStatus",
                    label: "Account status",
                    type: "string" as const,
                    section: "accountFields",
                    options: [
                        { value: "pending", label: "Pending" },
                        { value: "active", label: "Active" },
                    ],
                },
            ],
        };
        const enrichedDashboard = applyDashboardSourceOverlays(dashboard, [overlayWithOptions]);
        const detail = enrichedDashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;

        expect(detail.main[0]?.fields).toContainEqual({
            id: "accountStatus",
            label: "Account status",
            path: "metadata.accountStatus",
            type: "select",
            options: [
                { value: "pending", label: "Pending" },
                { value: "active", label: "Active" },
            ],
        });

        const enrichedSource = applySourceOverlays(source, [overlayWithOptions]);
        expect(
            enrichedSource.endpoints.find((endpoint) => endpoint.urn.endsWith(":getAccountByUserId"))?.output?.[0]
                ?.body,
        ).toMatchObject({
            properties: {
                metadata: {
                    properties: { accountStatus: { type: "string" } },
                },
            },
        });
        expect(validateDashboard(enrichedDashboard, { source: enrichedSource })).toEqual([]);
    });

    test("preserves numeric overlay fields as numeric dashboard inputs", () => {
        const enriched = applyDashboardSourceOverlays(dashboard, [
            {
                ...sourceOverlay,
                fields: [
                    {
                        id: "employeeCount",
                        label: "Employee count",
                        type: "number",
                        section: "accountFields",
                    },
                ],
            },
        ]);
        const detail = enriched.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;

        expect(detail.main[0]?.fields).toContainEqual({
            id: "employeeCount",
            label: "Employee count",
            path: "metadata.employeeCount",
            type: "number",
        });
    });

    test("does not attach fields to widgets backed by unrelated endpoints", () => {
        const unrelatedDashboard: Dashboard = {
            ...dashboard,
            views: [
                ...dashboard.views,
                {
                    widget: "w-table",
                    id: "ordersTable",
                    source: { endpoint: "listOrders", itemsPath: "items" },
                    rowKey: "id",
                    columns: [{ id: "id", label: "Order", path: "id" }],
                },
                {
                    widget: "w-detail",
                    id: "orderDetail",
                    source: { endpoint: "getOrder" },
                    main: [
                        {
                            id: "orderFields",
                            title: "Order",
                            fields: [{ id: "id", label: "Order", path: "id", type: "readonly" }],
                        },
                    ],
                },
            ],
        };

        const enriched = applyDashboardSourceOverlays(unrelatedDashboard, [sourceOverlay]);
        const table = enriched.views[2] as Extract<Dashboard["views"][number], { widget: "w-table" }>;
        const detail = enriched.views[3] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;
        const originalDetail = unrelatedDashboard.views[3] as typeof detail;

        expect(table.columns).toEqual([{ id: "id", label: "Order", path: "id" }]);
        expect(detail.main).toEqual(originalDetail.main);
    });

    test("renders output-only overlay fields as readonly dashboard fields", () => {
        const readonlyDashboard = {
            ...dashboard,
            views: dashboard.views.map((view) => (view.widget === "w-detail" ? { ...view, actions: [] } : view)),
        } as Dashboard;
        const enriched = applyDashboardSourceOverlays(readonlyDashboard, [sourceOverlay]);
        const detail = enriched.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;

        expect(detail.main[0]?.fields).toContainEqual({
            id: "company",
            label: "Company",
            path: "metadata.company",
            type: "readonly",
        });
        expect(detail.main[0]?.fields).toContainEqual({
            id: "optIn",
            label: "Opt-in",
            path: "metadata.optIn",
            type: "readonly",
        });
    });

    test("projects nested overlay fields relative to dashboard resources", () => {
        const nestedOverlay = {
            ...sourceOverlay,
            id: "product-fields",
            input: [],
            output: [
                { endpointId: "listAccounts", path: "accounts[].product" },
                { endpointId: "getAccountByUserId", path: "product" },
            ],
            sections: [{ id: "productFields", label: "Product custom fields" }],
            fields: [
                {
                    id: "brand",
                    label: "Brand",
                    type: "string" as const,
                    section: "productFields",
                    showInDashboardTable: true,
                },
            ],
        };
        const enriched = applyDashboardSourceOverlays(dashboard, [nestedOverlay]);
        const table = enriched.views[0] as Extract<Dashboard["views"][number], { widget: "w-table" }>;
        const detail = enriched.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;

        expect(table.columns).toContainEqual({
            id: "product_brand",
            label: "Brand",
            path: "product.metadata.brand",
        });
        expect(detail.main.find((section) => section.id === "productFields")?.fields).toContainEqual({
            id: "product_brand",
            label: "Brand",
            path: "product.metadata.brand",
            type: "readonly",
        });
    });
});
