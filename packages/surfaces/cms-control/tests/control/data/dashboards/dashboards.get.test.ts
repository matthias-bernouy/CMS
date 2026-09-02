import { describe, expect, test } from "bun:test";
import { InMemoryDashboardViewRepository, normalizeLegacyDashboardView } from "@bernouy/cms-dashboards";
import { InMemoryFunctionRepository, withFunctionsSource } from "@bernouy/cms-functions";
import {
    CompositeSourceRepository,
    InMemorySourceRepository,
    SYSTEM_AUTH_SOURCE,
    SYSTEM_AUTH_SOURCE_URN,
    SYSTEM_SOURCES,
} from "@bernouy/cms-sources";
import listDashboards from "cms-control/api/_platform/dashboards.get";

const list = () => new Request("http://localhost/cms/api/dashboards", { method: "GET" });

describe("GET /api/dashboards", () => {
    test("groups dashboards under their source", async () => {
        const sources = new InMemorySourceRepository();
        const dashboardViews = new InMemoryDashboardViewRepository();
        await sources.createSource({
            urn: "urn:commerce",
            meta: { name: "Commerce", icon: "database", svg: '<svg viewBox="0 0 24 24"></svg>' },
            endpoints: [
                {
                    urn: "urn:commerce:listOrders",
                    method: "GET",
                    targetUrl: "https://api.example.com/orders",
                },
            ],
        });
        await dashboardViews.createView(
            normalizeLegacyDashboardView({
                id: "orders",
                meta: { name: "Orders" },
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
            }),
        );

        const body = await (await listDashboards(list(), { sources, dashboardViews } as any)).json();
        expect(body).toHaveLength(1);
        expect(body[0].source).toEqual({
            urn: "urn:commerce",
            id: "commerce",
            name: "Commerce",
            icon: "database",
            svg: '<svg viewBox="0 0 24 24"></svg>',
            endpointCount: 1,
            dashboardCount: 1,
            readonly: false,
        });
        expect(body[0].endpoints[0].endpointId).toBe("listOrders");
        expect(body[0].dashboards[0].id).toBe("orders");
    });

    test("includes sources with no dashboards and marks system sources readonly", async () => {
        const sources = new CompositeSourceRepository(new InMemorySourceRepository(), SYSTEM_SOURCES);
        const dashboardViews = new InMemoryDashboardViewRepository();

        const body = await (await listDashboards(list(), { sources, dashboardViews } as any)).json();
        expect(body[0].source).toEqual({
            urn: SYSTEM_AUTH_SOURCE_URN,
            id: "system-auth",
            name: "Authentication",
            endpointCount: SYSTEM_AUTH_SOURCE.endpoints.length,
            dashboardCount: 0,
            readonly: true,
        });
        expect(body[0].dashboards).toEqual([]);
    });

    test("does not list system functions in the admin sources screen", async () => {
        const baseSources = new InMemorySourceRepository();
        const dashboardViews = new InMemoryDashboardViewRepository();
        const functions = new InMemoryFunctionRepository();
        await functions.createFunction({
            id: "updateMyProduct",
            method: "POST",
            steps: [],
            return: {},
        });

        const body = await (
            await listDashboards(list(), {
                sources: withFunctionsSource(baseSources, functions),
                dashboardViews,
            } as any)
        ).json();

        expect(body.map((group: any) => group.source.id)).not.toContain("system-functions");
    });
});
