import { describe, expect, test } from "bun:test";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import {
    CompositeSourceRepository,
    InMemorySourceRepository,
    SYSTEM_AUTH_SOURCE_URN,
    SYSTEM_SOURCES,
} from "@bernouy/cms-sources";
import listDashboards from "cms-control/api/dashboards.get";

const list = () => new Request("http://localhost/cms/api/dashboards", { method: "GET" });

describe("GET /api/dashboards", () => {
    test("groups dashboards under their source", async () => {
        const sources = new InMemorySourceRepository();
        const dashboards = new InMemoryDashboardRepository();
        await sources.createSource({
            urn: "urn:commerce",
            meta: { name: "Commerce", icon: "database", svg: "<svg viewBox=\"0 0 24 24\"></svg>" },
            endpoints: [
                {
                    urn: "urn:commerce:listOrders",
                    method: "GET",
                    targetUrl: "https://api.example.com/orders",
                },
            ],
        });
        await dashboards.createDashboard({
            id: "orders",
            meta: { name: "Orders" },
            source: "commerce",
            collections: [{ id: "orders", list: { endpoint: "listOrders" } }],
            views: [{ widget: "w-table", collection: "orders" }],
        });

        const body = await (await listDashboards(list(), { sources, dashboards } as any)).json();
        expect(body).toHaveLength(1);
        expect(body[0].source).toEqual({
            urn: "urn:commerce",
            id: "commerce",
            name: "Commerce",
            icon: "database",
            svg: "<svg viewBox=\"0 0 24 24\"></svg>",
            endpointCount: 1,
            dashboardCount: 1,
            readonly: false,
        });
        expect(body[0].endpoints[0].endpointId).toBe("listOrders");
        expect(body[0].dashboards[0].id).toBe("orders");
    });

    test("includes sources with no dashboards and marks system sources readonly", async () => {
        const sources = new CompositeSourceRepository(new InMemorySourceRepository(), SYSTEM_SOURCES);
        const dashboards = new InMemoryDashboardRepository();

        const body = await (await listDashboards(list(), { sources, dashboards } as any)).json();
        expect(body[0].source).toEqual({
            urn: SYSTEM_AUTH_SOURCE_URN,
            id: "system-auth",
            name: "Authentication",
            endpointCount: 8,
            dashboardCount: 0,
            readonly: true,
        });
        expect(body[0].dashboards).toEqual([]);
    });
});
