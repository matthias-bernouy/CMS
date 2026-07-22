export function detailElement(widget: unknown): HTMLElement {
    const detail = document.createElement("cms-dashboard-w-detail");
    detail.setAttribute("data-config-json", JSON.stringify(widget));
    return detail;
}

export function sharedLookupWidget(): unknown {
    const lookup = {
        endpoint: "brands",
        params: { categoryId: "$field.categoryId" },
        itemsPath: "items",
        valuePath: "id",
        labelPath: "name",
    };
    return widget([
        { id: "categoryId", label: "Category", path: "categoryId", type: "text" },
        { id: "brandId", label: "Brand", path: "brandId", type: "combobox", lookup },
        { id: "secondaryBrandId", label: "Secondary brand", path: "secondaryBrandId", type: "combobox", lookup },
        {
            id: "metadata",
            label: "Metadata",
            path: "metadata",
            type: "schema",
            schema: {
                endpoint: "brands",
                params: { categoryId: "$field.categoryId" },
                itemsPath: "fields",
            },
        },
    ]);
}

export function singleLookupWidget(): unknown {
    return {
        ...widget([
            {
                id: "productId",
                label: "Product",
                path: "productId",
                type: "combobox",
                lookup: {
                    endpoint: "products",
                    params: { ownerId: "$resource.id" },
                    itemsPath: "items",
                    valuePath: "id",
                    labelPath: "title",
                },
            },
        ]),
        title: { path: "title", fallback: "Product" },
    };
}

function widget(fields: unknown[]) {
    return {
        widget: "w-detail",
        id: "detail",
        source: { endpoint: "resource" },
        main: [{ id: "main", title: "Main", fields }],
    };
}
