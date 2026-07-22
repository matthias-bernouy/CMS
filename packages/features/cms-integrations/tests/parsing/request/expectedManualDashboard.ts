export const EXPECTED_MANUAL_DASHBOARD_ARTIFACT = {
    type: "dashboard",
    dashboard: {
        id: "items-dashboard",
        meta: { name: "Items", icon: "database", svg: '<svg viewBox="0 0 24 24"></svg>' },
        source: "items",
        views: [
            {
                widget: "w-table",
                id: "itemsTable",
                source: { endpoint: "list", itemsPath: "items" },
                rowKey: "id",
                columns: [
                    { id: "name", label: "Name", path: "name", primary: true },
                    { id: "owner", label: "Owner", path: "owner" },
                ],
            },
            {
                widget: "w-detail",
                id: "itemDetail",
                source: { endpoint: "get", params: { id: "$selection.id" }, itemPath: "item" },
                title: { path: "name", fallback: "Item" },
                actions: [
                    {
                        id: "save",
                        label: "Save item",
                        placement: "primary",
                        endpoint: {
                            endpoint: "update",
                            params: { id: "$resource.id" },
                            body: { owner: "$field.owner" },
                        },
                    },
                    {
                        id: "delete",
                        label: "Delete item",
                        placement: "more",
                        section: "Other actions",
                        tone: "danger",
                        endpoint: { endpoint: "delete", params: { id: "$resource.id" } },
                        confirm: "Delete this item?",
                    },
                    {
                        id: "export",
                        label: "Export CSV",
                        placement: "more",
                        section: "Share",
                        endpoint: { endpoint: "exportItems", params: { q: "$param.q" } },
                    },
                ],
                main: [
                    {
                        id: "general",
                        title: "General",
                        fields: [
                            { id: "owner", label: "Owner", path: "owner", type: "text", required: true },
                            {
                                id: "image",
                                label: "Image",
                                path: "images",
                                type: "media",
                                item: { idPath: "id", urlPath: "url", altPath: "alt" },
                                actions: {
                                    upload: { endpoint: "uploadImage", params: { id: "$resource.id" } },
                                },
                            },
                            {
                                id: "website",
                                label: "Website",
                                path: "website",
                                type: "readonly",
                                format: "url",
                            },
                        ],
                    },
                ],
            },
        ],
    },
};
