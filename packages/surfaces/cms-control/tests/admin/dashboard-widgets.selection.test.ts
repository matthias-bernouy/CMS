import { describe, expect, test } from "bun:test";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import { widgetsForSelection } from "cms-control/components/admin/Resources/Dashboards/domain";

describe("dashboard widget selection", () => {
    test("returns the selected detail widget without list wrappers", () => {
        const dashboard = {
            id:     "products",
            source: "products",
            views:  [
                {
                    widget: "w-tabs",
                    id:     "rootTabs",
                    tabs:   [
                        {
                            id:       "products",
                            label:    "Products",
                            children: [
                                { widget: "w-table", id: "productsTable", source: { endpoint: "products" }, rowKey: "id", columns: [] },
                                { widget: "w-detail", id: "productDetail", source: { endpoint: "product" }, title: { path: "title" }, main: [] },
                            ],
                        },
                    ],
                },
            ],
        } as DashboardDto;

        expect(widgetsForSelection(dashboard, null).map(widget => widget.widget)).toEqual(["w-tabs"]);
        const detailWidgets = widgetsForSelection(dashboard, { collection: "productDetail", row: "1" });

        expect(detailWidgets).toHaveLength(1);
        expect(detailWidgets[0]?.widget).toBe("w-detail");
        expect(detailWidgets[0]?.id).toBe("productDetail");
    });
});
