import { describe, expect, test } from "bun:test";
import { mountDashboardWidgets } from "cms-control/components/admin/Resources/Dashboards/runtime/mounting/mount";
import {
    detailResource,
    productDashboard,
    productDetailWidget,
    renderContext,
    simpleDetailWidget,
    waitFor,
} from "./fixtures";
import { setupDashboardWidgetSelectionTests } from "./setup";

setupDashboardWidgetSelectionTests();

describe("dashboard widget selection", () => {
    test("mounts a matching action resource without refetching the main detail", async () => {
        const resource = {
            id: "product-1",
            title: "Updated product",
            categoryId: "category-1",
            brandId: "brand-1",
            attributes: { material: null },
        };
        const requests: string[] = [];
        globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
            const url = new URL(String(input), window.location.origin);
            requests.push(`${url.pathname}${url.search}`);
            if (url.pathname.endsWith("/getProduct")) {
                return Response.json({ item: resource });
            }
            if (url.pathname.endsWith("/brands")) {
                return Response.json({ items: [{ id: "brand-1", name: "Acme" }] });
            }
            if (url.pathname.endsWith("/categorySchema")) {
                return Response.json({ fields: [{ id: "material", label: "Material", type: "string" }] });
            }
            if (url.pathname === "/api/relations/page") {
                return Response.json({ items: [] });
            }
            return new Response("unexpected source", { status: 500 });
        }) as unknown as typeof fetch;
        const dashboard = productDashboard();
        const widget = productDetailWidget();
        const selection = { collection: "productDetail", row: "product-1" };
        const root = document.createElement("div");
        mountDashboardWidgets(
            root,
            [widget] as never[],
            renderContext(dashboard, detailResource(dashboard, selection, resource)),
            "root",
            new Map(),
            selection,
        );
        document.body.append(root);

        await waitFor(
            () =>
                requests.some((url) => url.includes("/brands")) &&
                requests.some((url) => url.includes("/categorySchema")) &&
                requests.some((url) => url.startsWith("/api/relations/page")),
        );

        const detail = root.querySelector<HTMLElement>("cms-dashboard-w-detail")!;
        const config = JSON.parse(detail.dataset.configJson!);
        expect(root.querySelector("[cms-source*='/getProduct']")).toBeNull();
        expect(JSON.parse(detail.dataset.sourceJson!)).toEqual(resource);
        expect(config.source).toEqual({
            endpoint: "getProduct",
            params: { id: "$selection.id" },
        });
        expect(requests.some((url) => url.includes("/getProduct"))).toBeFalse();
        expect(requests.filter((url) => url.includes("/brands"))).toHaveLength(1);
        expect(requests.filter((url) => url.includes("/categorySchema"))).toHaveLength(1);
        expect(requests.filter((url) => url.startsWith("/api/relations/page"))).toHaveLength(1);
    });

    test("keeps the source request when an action resource is null", async () => {
        let requests = 0;
        globalThis.fetch = (async () => {
            requests += 1;
            return Response.json(null);
        }) as unknown as typeof fetch;
        const dashboard = productDashboard();
        const widget = simpleDetailWidget();
        const selection = { collection: "productDetail", row: "product-1" };
        const root = document.createElement("div");
        mountDashboardWidgets(
            root,
            [widget] as never[],
            renderContext(dashboard, detailResource(dashboard, selection, null)),
            "root",
            new Map(),
            selection,
        );
        document.body.append(root);

        await waitFor(() => requests === 1);

        expect(root.querySelector("[cms-source*='/getProduct']")).not.toBeNull();
        expect(requests).toBe(1);
    });

    test("keeps the source wrapper when the action resource does not match", () => {
        const dashboard = productDashboard();
        const widget = simpleDetailWidget();
        const selection = { collection: "productDetail", row: "product-1" };
        const mismatch = {
            ...detailResource(dashboard, selection, { id: "private-product" }),
            sourceId: "another-source",
            row: "product-2",
        };
        const root = document.createElement("div");
        mountDashboardWidgets(
            root,
            [widget] as never[],
            renderContext(dashboard, mismatch),
            "root",
            new Map(),
            selection,
        );

        const wrapper = root.querySelector<HTMLElement>("[cms-source*='/getProduct']")!;
        const detail = wrapper.querySelector<HTMLElement>("cms-dashboard-w-detail")!;
        expect(wrapper.getAttribute("cms-source")).toBe(
            "/.cms/sources/products/getProduct?id=product-1 as dashboardData",
        );
        expect(detail.dataset.sourceJson).toBe("{{ dashboardData | json }}");
    });
});
