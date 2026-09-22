import { describe, expect, test } from "bun:test";
import { mountDashboardWidgets } from "cms-control/components/admin/Resources/Dashboards/runtime/mounting/mount";
import { productDashboard, productDetailWidget, renderContext, simpleDetailWidget, waitFor } from "./fixtures";
import { setupDashboardWidgetSelectionTests } from "./setup";

setupDashboardWidgetSelectionTests();

describe("dashboard widget selection", () => {
    test("reads the common detail once and loads its dependent lookups", async () => {
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
            return new Response("unexpected source", { status: 500 });
        }) as unknown as typeof fetch;
        const dashboard = productDashboard();
        const widget = productDetailWidget();
        const selection = { collection: "productDetail", row: "product-1" };
        const root = document.createElement("cms-binding-core");
        mountDashboardWidgets(
            root,
            [widget] as never[],
            renderContext(dashboard, selection),
            "root",
            new Map(),
            selection,
        );
        document.body.append(root);

        await waitFor(
            () =>
                requests.some((url) => url.includes("/brands")) &&
                requests.some((url) => url.includes("/categorySchema")),
        );

        const detail = root.querySelector<HTMLElement>("cms-dashboard-w-detail")!;
        await waitFor(() => Boolean(detail.querySelector('[data-schema-key="material"]')));
        expect(detail.hasAttribute("data-config-json")).toBe(false);
        expect(root.querySelector("[cms-source*='/getProduct']")).toBe(detail);
        expect(detail.hasAttribute("data-source-json")).toBe(false);
        expect(detail.querySelector('[data-field-control="title"]')).not.toBeNull();
        expect(detail.querySelector('[data-schema-key="material"]')).not.toBeNull();
        expect(requests.filter((url) => url.includes("/getProduct"))).toHaveLength(1);
        expect(requests.filter((url) => url.includes("/brands"))).toHaveLength(1);
        expect(requests.filter((url) => url.includes("/categorySchema"))).toHaveLength(1);
    });

    test("retains the same detail and fields without another read when its context is reconciled", async () => {
        let requests = 0;
        globalThis.fetch = (async () => {
            requests += 1;
            return Response.json({ id: "product-1", title: "Loaded" });
        }) as unknown as typeof fetch;
        const dashboard = productDashboard();
        const widget = simpleDetailWidget();
        const selection = { collection: "productDetail", row: "product-1" };
        const root = document.createElement("cms-binding-core");
        const tabs = new Map<string, number>();
        const mount = () =>
            mountDashboardWidgets(
                root,
                [widget] as never[],
                renderContext(dashboard, selection),
                "root",
                tabs,
                selection,
            );
        mount();
        document.body.append(root);
        await waitFor(() => Boolean(root.querySelector('[data-field-control="title"]')) && requests === 1);
        const detail = root.querySelector("cms-dashboard-w-detail");
        const title = root.querySelector('[data-field-control="title"]');
        mount();
        expect(root.querySelector("cms-dashboard-w-detail")).toBe(detail);
        expect(root.querySelector('[data-field-control="title"]')).toBe(title);
        expect(requests).toBe(1);
    });
});
