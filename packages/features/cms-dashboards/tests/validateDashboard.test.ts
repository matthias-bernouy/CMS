import { describe, expect, test } from "bun:test";
import type { Source, SourceEndpoint } from "@bernouy/cms-sources";
import { validateDashboard, type Dashboard } from "@bernouy/cms-dashboards";

const endpoint = (
    endpointId: string,
    inputParams: string[] = [],
): SourceEndpoint => ({
    urn: `urn:products:${endpointId}`,
    method: "GET",
    targetUrl: `https://example.com/${endpointId}`,
    input: {
        params: inputParams.map(name => ({
            name,
            in: "query",
            schema: { type: "string" },
        })),
    },
});

const source: Source = {
    urn: "urn:products",
    endpoints: [
        endpoint("listProducts", ["q", "status"]),
        endpoint("getProduct", ["productId"]),
        endpoint("updateProduct", ["productId"]),
        endpoint("deleteProduct", ["productId"]),
        endpoint("searchBrands", ["q"]),
        endpoint("createBrand"),
        endpoint("uploadProductImage", ["productId"]),
        endpoint("removeProductImage", ["productId", "mediaId"]),
        endpoint("reorderProductImages", ["productId"]),
    ],
};

const validDashboard = (): Dashboard => ({
    id: "products",
    meta: { name: "Products", icon: "package" },
    source: "products",
    views: [
        {
            widget: "w-table",
            id: "productsTable",
            source: {
                endpoint: "listProducts",
                params: { q: "$filter.search", status: "$filter.status" },
                itemsPath: "items",
                totalPath: "total",
            },
            rowKey: "id",
            columns: [
                { id: "title", label: "Title", path: "title", primary: true },
                { id: "status", label: "Status", path: "status", format: "badge" },
            ],
            filters: [
                { id: "search", label: "Search", param: "q", type: "text" },
                {
                    id: "status",
                    label: "Status",
                    param: "status",
                    type: "select",
                    options: [
                        { value: "draft", label: "Draft" },
                        { value: "active", label: "Active" },
                    ],
                },
            ],
            selection: { opens: "productDetail" },
        },
        {
            widget: "w-detail",
            id: "productDetail",
            source: {
                endpoint: "getProduct",
                params: { productId: "$selection.id" },
                itemPath: "item",
            },
            title: { path: "title", fallback: "Product" },
            status: { path: "status" },
            actions: [
                {
                    id: "save",
                    label: "Save changes",
                    placement: "primary",
                    tone: "primary",
                    endpoint: {
                        endpoint: "updateProduct",
                        params: { productId: "$resource.id" },
                        body: { title: "$field.title", status: "$field.status" },
                    },
                },
                {
                    id: "delete",
                    label: "Delete product",
                    placement: "more",
                    section: "Other actions",
                    tone: "danger",
                    endpoint: {
                        endpoint: "deleteProduct",
                        params: { productId: "$resource.id" },
                    },
                },
            ],
            main: [
                {
                    id: "general",
                    title: "General",
                    fields: [
                        { id: "title", label: "Title", path: "title", type: "text" },
                        { id: "description", label: "Description", path: "description", type: "textarea", rows: 4 },
                        {
                            id: "brand",
                            label: "Brand",
                            path: "brandId",
                            type: "combobox",
                            lookup: {
                                endpoint: "searchBrands",
                                params: { q: "$search" },
                                itemsPath: "items",
                                valuePath: "id",
                                labelPath: "name",
                                selected: "$resource.brand",
                                create: {
                                    mode: "modal",
                                    endpoint: "createBrand",
                                    body: { name: "$field.name" },
                                    valuePath: "id",
                                    labelPath: "name",
                                    fields: [
                                        { id: "name", label: "Name", path: "name", type: "text", required: true },
                                    ],
                                },
                            },
                        },
                        {
                            id: "tags",
                            label: "Tags",
                            path: "tags",
                            type: "tokens",
                            options: [
                                { value: "sport", label: "Sport" },
                                { value: "featured", label: "Featured" },
                            ],
                            allowCustom: true,
                        },
                    ],
                },
                {
                    id: "media",
                    title: "Media",
                    fields: [
                        {
                            id: "images",
                            label: "Images",
                            path: "images",
                            type: "media",
                            multiple: true,
                            item: { idPath: "id", urlPath: "url", altPath: "alt" },
                            actions: {
                                upload: {
                                    endpoint: "uploadProductImage",
                                    params: { productId: "$resource.id" },
                                },
                                remove: {
                                    endpoint: "removeProductImage",
                                    params: { productId: "$resource.id", mediaId: "$media.item.id" },
                                },
                                reorder: {
                                    endpoint: "reorderProductImages",
                                    params: { productId: "$resource.id" },
                                    body: { mediaIds: "$media.valueIds" },
                                },
                            },
                        },
                    ],
                },
            ],
            aside: [
                {
                    id: "status",
                    title: "Status",
                    fields: [
                        {
                            id: "status",
                            label: "Publication",
                            path: "status",
                            type: "select",
                            options: [
                                { value: "draft", label: "Draft" },
                                { value: "active", label: "Active" },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
});

describe("validateDashboard", () => {
    test("accepts a new widget-first dashboard against its source", () => {
        expect(validateDashboard(validDashboard(), { source })).toEqual([]);
    });

    test("rejects legacy widgets", () => {
        const dashboard = validDashboard();
        dashboard.views.push({ widget: "w-create", id: "createProduct", collection: "products" } as never);

        expect(validateDashboard(dashboard, { source })).toContain("views.2.widget is not supported");
    });

    test("rejects duplicate widget ids", () => {
        const dashboard = validDashboard();
        dashboard.views[1]!.id = "productsTable";

        expect(validateDashboard(dashboard, { source })).toContain('duplicate widget id "productsTable"');
    });

    test("rejects source endpoint references that do not exist", () => {
        const dashboard = validDashboard();
        const table = dashboard.views[0] as Extract<Dashboard["views"][number], { widget: "w-table" }>;
        table.source.endpoint = "missing";

        expect(validateDashboard(dashboard, { source })).toContain('views.0.source.endpoint references unknown endpoint "missing"');
    });

    test("rejects params not declared by source endpoints", () => {
        const dashboard = validDashboard();
        const table = dashboard.views[0] as Extract<Dashboard["views"][number], { widget: "w-table" }>;
        table.source.params = { unknown: "$filter.search" };

        expect(validateDashboard(dashboard, { source })).toContain('views.0.source.params.unknown is not declared by endpoint "urn:products:listProducts"');
    });

    test("validates lookup modal creation fields", () => {
        const dashboard = validDashboard();
        const detail = dashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;
        const brand = detail.main[0]!.fields[2] as Extract<Dashboard["views"][number], { widget: "w-detail" }>["main"][number]["fields"][number] & {
            type: "combobox";
        };
        if (brand.lookup?.create?.mode === "modal") brand.lookup.create.fields = [];

        expect(validateDashboard(dashboard, { source })).toContain("views.1.main.0.fields.2.lookup.create.fields must contain at least one field");
    });

    test("validates action metadata and media endpoints", () => {
        const dashboard = validDashboard();
        const detail = dashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;
        detail.actions![1]!.section = "";
        const media = detail.main[1]!.fields[0] as Extract<Dashboard["views"][number], { widget: "w-detail" }>["main"][number]["fields"][number] & {
            type: "media";
        };
        media.actions!.upload!.endpoint = "missingUpload";

        expect(validateDashboard(dashboard, { source })).toEqual(expect.arrayContaining([
            "views.1.actions.1.section must be non-empty when provided",
            'views.1.main.1.fields.0.actions.upload.endpoint references unknown endpoint "missingUpload"',
        ]));
    });

    test("validates download action filenames", () => {
        const dashboard = validDashboard();
        const table = dashboard.views[0] as Extract<Dashboard["views"][number], { widget: "w-table" }>;
        table.actions = [
            {
                id: "export",
                label: "Export",
                endpoint: { endpoint: "listProducts" },
                download: { filename: "../products.csv" },
            },
        ];

        expect(validateDashboard(dashboard, { source })).toContain("views.0.actions.0.download.filename must be a safe file name");
    });

    test("validates post-action detail targets", () => {
        const dashboard = validDashboard();
        const detail = dashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;
        detail.actions![0]!.after = { opens: "productDetail", row: "$result.id" };

        expect(validateDashboard(dashboard, { source })).toEqual([]);

        detail.actions![0]!.after = { opens: "missingDetail", row: "$result.id" };
        expect(validateDashboard(dashboard, { source })).toContain('views.1.actions.0.after.opens references unknown widget "missingDetail"');

        detail.actions![0]!.after = { opens: "productDetail", row: "$unknown.id" };
        expect(validateDashboard(dashboard, { source })).toContain("views.1.actions.0.after.row has an invalid binding expression");
    });

    test("rejects invalid binding expressions", () => {
        const dashboard = validDashboard();
        const detail = dashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;
        detail.actions![0]!.endpoint.body = { title: "$bad.title" };

        expect(validateDashboard(dashboard, { source })).toContain("views.1.actions.0.endpoint.body.title has an invalid binding expression");
    });
});
