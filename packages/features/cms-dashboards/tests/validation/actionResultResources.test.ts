import { describe, expect, test } from "bun:test";
import { validateDashboard, type Dashboard } from "@bernouy/cms-dashboards";
import { productSource } from "./dashboardSourceFixture";
import { validDashboard } from "./validDashboardFixture";

type DetailWidget = Extract<Dashboard["views"][number], { widget: "w-detail" }>;
type TableWidget = Extract<Dashboard["views"][number], { widget: "w-table" }>;

function dashboardWithDetail(): { dashboard: Dashboard; detail: DetailWidget } {
    const dashboard = validDashboard();
    return { dashboard, detail: dashboard.views[1] as DetailWidget };
}

describe("dashboard action result resources", () => {
    test("accepts result resources for the current or a newly opened detail", () => {
        const { dashboard, detail } = dashboardWithDetail();

        for (const after of [
            { resource: "$result" },
            { resource: "$result.item" },
            { opens: "productDetail", row: "$result.item.id", resource: "$result.item" },
        ]) {
            detail.actions![0]!.after = after;
            expect(validateDashboard(dashboard, { source: productSource })).toEqual([]);
        }
    });

    test("rejects incomplete result resource contracts", () => {
        const { dashboard, detail } = dashboardWithDetail();

        for (const [after, error] of [
            [{}, "views.1.actions.0.after must declare opens or resource"],
            [{ row: "$result.id" }, "views.1.actions.0.after.row requires opens"],
        ] as const) {
            detail.actions![0]!.after = after;
            expect(validateDashboard(dashboard, { source: productSource })).toContain(error);
        }
    });

    test("only accepts safe result expressions for post-action resources", () => {
        const { dashboard, detail } = dashboardWithDetail();

        for (const resource of [
            "$field.item",
            "$selection.item",
            "$result.__proto__.item",
            "$result.constructor.item",
            "$result.item.prototype",
        ]) {
            detail.actions![0]!.after = { resource };
            expect(validateDashboard(dashboard, { source: productSource })).toContain(
                "views.1.actions.0.after.resource must be a safe $result expression",
            );
        }
    });

    test("requires an opened detail for collection resources and rejects download resources", () => {
        const { dashboard, detail } = dashboardWithDetail();
        const table = dashboard.views[0] as TableWidget;
        table.actions = [
            {
                id: "refresh",
                label: "Refresh",
                endpoint: { endpoint: "listProducts" },
                after: { resource: "$result" },
            },
        ];
        detail.actions![0]!.download = { filename: "product.json" };
        detail.actions![0]!.after = { resource: "$result" };

        expect(validateDashboard(dashboard, { source: productSource })).toEqual(
            expect.arrayContaining([
                "views.0.actions.0.after.resource requires after.opens on collection actions",
                "views.1.actions.0.after.resource is not supported with download",
            ]),
        );
    });
});
