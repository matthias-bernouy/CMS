import type { DashboardDto } from "@bernouy/cms-dashboards";
import { mountDashboardWidgets } from "cms-control/components/admin/Resources/Dashboards/runtime/mount";

export function productDashboard(): DashboardDto {
    return {
        id: "products",
        source: "products",
        views: [],
    };
}

export function simpleDetailWidget() {
    return {
        widget: "w-detail",
        id: "productDetail",
        source: { endpoint: "getProduct", params: { id: "$selection.id" } },
        title: { path: "title", fallback: "Product" },
        main: [
            {
                id: "general",
                title: "General",
                fields: [{ id: "title", label: "Title", path: "title", type: "text" }],
            },
        ],
    };
}

export function productDetailWidget() {
    return {
        ...simpleDetailWidget(),
        source: {
            endpoint: "getProduct",
            params: { id: "$selection.id" },
            itemPath: "item",
        },
        main: [
            {
                id: "general",
                title: "General",
                fields: [
                    { id: "title", label: "Title", path: "title", type: "text" },
                    {
                        id: "brandId",
                        label: "Brand",
                        path: "brandId",
                        type: "combobox",
                        lookup: {
                            endpoint: "brands",
                            params: { categoryId: "$resource.categoryId" },
                            itemsPath: "items",
                            valuePath: "id",
                            labelPath: "name",
                        },
                    },
                    {
                        id: "attributes",
                        label: "Attributes",
                        path: "attributes",
                        type: "schema",
                        schema: {
                            endpoint: "categorySchema",
                            params: { categoryId: "$resource.categoryId" },
                            itemsPath: "fields",
                        },
                    },
                ],
            },
        ],
        relationWidgets: [
            {
                widget: "w-relation-table",
                id: "offersRelation",
                title: "Offers",
                placement: "main",
                relationId: "product-offers",
                fromId: "product-1",
                rowKey: "id",
                columns: [{ id: "id", label: "ID", path: "id", primary: true }],
            },
        ],
    };
}

export function detailResource(
    dashboard: DashboardDto,
    selection: { collection: string; row: string },
    resource: unknown,
) {
    return {
        sourceId: dashboard.source,
        dashboardId: dashboard.id,
        ...selection,
        resource,
    };
}

export function renderContext(dashboard: DashboardDto, detailResourceOverride: ReturnType<typeof detailResource>) {
    return {
        group: {
            source: {
                urn: "urn:products",
                id: "products",
                name: "Products",
                endpointCount: 3,
                dashboardCount: 1,
                readonly: false,
            },
            endpoints: [],
            dashboards: [dashboard],
        },
        dashboard,
        selectedRows: new Map([[detailResourceOverride.collection, detailResourceOverride.row]]),
        drafts: new Map(),
        detailResource: detailResourceOverride,
    } as unknown as Parameters<typeof mountDashboardWidgets>[2];
}

export async function waitFor(predicate: () => boolean, timeout = 1_000): Promise<void> {
    const started = Date.now();
    while (!predicate()) {
        if (Date.now() - started > timeout) {
            throw new Error("Timed out waiting for dashboard resource requests");
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}
