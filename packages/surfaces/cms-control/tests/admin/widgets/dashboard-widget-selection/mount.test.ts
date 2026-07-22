import { describe, expect, test } from "bun:test";
import { relationDetailSectionElement } from "cms-control/components/admin/Resources/Dashboards/runtime/mounting/mountRelations";
import { setupDashboardWidgetSelectionTests } from "./setup";

setupDashboardWidgetSelectionTests();

describe("dashboard widget selection", () => {
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
