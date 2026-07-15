import { describe, expect, test } from "bun:test";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import { widgetsForSelection } from "cms-control/components/admin/Resources/Dashboards/domain";
import { relationDetailSectionElement } from "cms-control/components/admin/Resources/Dashboards/runtime/mount/relations";

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

    test("keeps unreferenced detail widgets visible without a row selection", () => {
        const dashboard = {
            id:     "settings",
            source: "emailer",
            views:  [
                {
                    widget: "w-detail",
                    id:     "emailerSettings",
                    source: { endpoint: "getSettings" },
                    title:  { path: "provider", fallback: "Settings" },
                    main:   [{
                        id: "provider",
                        title: "Provider",
                        fields: [{ id: "smtpHost", label: "SMTP host", path: "smtpHost", type: "readonly" }],
                    }],
                },
            ],
        } as DashboardDto;

        const widgets = widgetsForSelection(dashboard, null);

        expect(widgets).toHaveLength(1);
        expect(widgets[0]?.widget).toBe("w-detail");
        expect(widgets[0]?.id).toBe("emailerSettings");
    });

    test("attaches relation table widgets to selected details", () => {
        const dashboard = {
            id:     "products",
            source: "products",
            views:  [{
                widget: "w-detail",
                id:     "productDetail",
                source: { endpoint: "product" },
                main:   [],
            }],
        } as DashboardDto;

        const widgets = widgetsForSelection(dashboard, { collection: "productDetail", row: "product-1" }, [{
            type:       "dashboardRelation",
            relationId: "product-offers",
            dashboardId: "products",
            viewId:     "productDetail",
            widget:     "table",
            title:      "Offers",
            placement:  "side",
            rowKey:     "offerId",
            pageSize:   10,
            columns:    [{ id: "title", label: "Offer", path: "title", primary: true }],
        }]);

        expect(widgets[0]).toMatchObject({
            widget: "w-detail",
            relationWidgets: [{
                id: "product-offersRelation",
                relationId: "product-offers",
                fromId: "product-1",
                placement: "aside",
                rowKey: "offerId",
                pageSize: 10,
            }],
        });
    });

    test("mounts relation sections with relation page sources", () => {
        const section = relationDetailSectionElement({
            widget: "w-relation-table",
            id: "offersRelation",
            title: "Offers",
            placement: "main",
            relationId: "product-offers",
            fromId: "product-1",
            pageSize: 10,
            rowKey: "id",
            columns: [{ id: "title", label: "Offer", path: "title", primary: true }],
        });

        const wrapper = section.querySelector("[cms-source]")!;
        const table = section.querySelector("cms-dashboard-w-table")!;
        const config = JSON.parse(table.getAttribute("data-config-json")!);

        expect(section.getAttribute("slot")).toBe("main-extra");
        expect(wrapper.getAttribute("cms-source")).toBe(
            "/api/relations/page?relation=product-offers&fromId=product-1&limit=10&offset=0 as dashboardData",
        );
        expect(config).toMatchObject({
            widget: "w-table",
            id: "offersRelation",
            rowKey: "id",
            columns: [{ id: "title", label: "Offer", path: "title", primary: true }],
        });
    });
});
