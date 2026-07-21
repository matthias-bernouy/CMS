import { describe, expect, test } from "bun:test";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { InMemoryRelationRepository } from "@bernouy/cms-relations";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import listDashboards from "cms-control/api/dashboards.get";

const list = () => new Request("http://localhost/cms/api/dashboards", { method: "GET" });

describe("GET /api/dashboards relation projections", () => {
    test("includes projections for matching dashboards", async () => {
        const sources = new InMemorySourceRepository();
        const dashboards = new InMemoryDashboardRepository();
        const relations = new InMemoryRelationRepository();
        await sources.createSource({
            urn: "urn:products",
            meta: { name: "Products" },
            endpoints: [],
        });
        await dashboards.createDashboard({
            id: "products-products",
            source: "products",
            views: [
                {
                    widget: "w-detail",
                    id: "productDetail",
                    source: { endpoint: "product", params: { id: "$selection.id" } },
                    main: [{ id: "details", title: "Details", fields: [] }],
                },
            ],
        });
        await relations.createDashboardRelationProjection({
            type: "dashboardRelation",
            relationId: "product-offers",
            dashboardId: "products-products",
            viewId: "productDetail",
            widget: "table",
            title: "Offers",
            columns: [{ id: "title", label: "Offer", path: "title", primary: true }],
        });

        const body = await (await listDashboards(list(), { sources, dashboards, relations } as any)).json();

        expect(body[0].dashboardRelationProjections).toEqual([
            {
                type: "dashboardRelation",
                relationId: "product-offers",
                dashboardId: "products-products",
                viewId: "productDetail",
                widget: "table",
                title: "Offers",
                columns: [{ id: "title", label: "Offer", path: "title", primary: true }],
            },
        ]);
    });
});
