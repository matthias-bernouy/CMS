import { expect, test } from "bun:test";
import { compileDashboardExecutionPlan, type ResolvedDashboard } from "@bernouy/cms-dashboards";
import { InMemorySourceRepository } from "@bernouy/cms-sources";

const dashboard: ResolvedDashboard = {
    schemaVersion: 2,
    id: "catalog",
    meta: { name: "Catalog" },
    homeView: "products",
    revision: "1",
    status: "published",
    origin: { kind: "site", createdBy: "admin" },
    views: [
        {
            id: "products",
            label: "Products",
            source: "commerce",
            children: [],
            widgets: [
                {
                    widget: "w-table",
                    id: "products",
                    source: { endpoint: "list" },
                    rowKey: "id",
                    columns: [{ id: "title", path: "title", label: "Title" }],
                    create: { viewId: "product", presentation: "page" },
                },
                {
                    widget: "w-detail",
                    id: "product",
                    source: { endpoint: "get" },
                    create: {},
                    save: { endpoint: "save" },
                    delete: { endpoint: "delete", confirm: "Delete?" },
                    actions: [{ id: "review", label: "Review", form: { endpoint: "review", sourceId: "workflow" } }],
                    main: [
                        {
                            id: "main",
                            title: "Product",
                            fields: [
                                {
                                    id: "images",
                                    label: "Images",
                                    path: "images",
                                    type: "media",
                                    item: { idPath: "id", urlPath: "url", endpoint: "image" },
                                },
                                {
                                    id: "brand",
                                    label: "Brand",
                                    path: "brand",
                                    type: "combobox",
                                    lookup: {
                                        endpoint: "brands",
                                        valuePath: "id",
                                        labelPath: "name",
                                        create: {
                                            dashboardId: "taxonomy",
                                            viewId: "brandDetail",
                                            presentation: "modal",
                                            valuePath: "id",
                                            labelPath: "name",
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
};

test("authorizes only declared form calls, including lookup and cross-source actions", async () => {
    const sources = new InMemorySourceRepository();
    await sources.createSource({
        urn: "urn:commerce",
        endpoints: ["list", "get", "save", "delete", "create", "brands", "createBrand", "image", "undeclared"].map(
            (id) => ({
                urn: `urn:commerce:${id}`,
                method: ["list", "get", "brands", "image"].includes(id) ? ("GET" as const) : ("POST" as const),
                targetUrl: "https://example.test",
            }),
        ),
    });
    await sources.createSource({
        urn: "urn:workflow",
        endpoints: [{ urn: "urn:workflow:review", method: "PATCH", targetUrl: "https://example.test" }],
    });
    const result = await compileDashboardExecutionPlan(dashboard, sources);
    expect(result.errors).toEqual([]);
    expect(result.plan!.allowedCalls.map((call) => `${call.sourceId}/${call.endpointId}/${call.method}`)).toEqual([
        "commerce/brands/GET",
        "commerce/delete/POST",
        "commerce/get/GET",
        "commerce/image/GET",
        "commerce/list/GET",
        "commerce/save/POST",
        "workflow/review/PATCH",
    ]);
    await sources.updateSource({
        urn: "urn:workflow",
        endpoints: [
            {
                urn: "urn:workflow:review",
                method: "PATCH",
                targetUrl: "https://example.test",
                access: { mode: "system" },
            },
        ],
    });
    const denied = await compileDashboardExecutionPlan(dashboard, sources);
    expect(denied.plan).toBeUndefined();
    expect(denied.errors).toEqual(['system endpoint "workflow/review" cannot be delegated']);
});
