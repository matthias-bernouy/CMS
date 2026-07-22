import type { Dashboard } from "@bernouy/cms-dashboards";

export const validDashboard = (): Dashboard => ({
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
            source: { endpoint: "getProduct", params: { productId: "$selection.id" }, itemPath: "item" },
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
                    endpoint: { endpoint: "deleteProduct", params: { productId: "$resource.id" } },
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
                                    fields: [{ id: "name", label: "Name", path: "name", type: "text", required: true }],
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
                                upload: { endpoint: "uploadProductImage", params: { productId: "$resource.id" } },
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
