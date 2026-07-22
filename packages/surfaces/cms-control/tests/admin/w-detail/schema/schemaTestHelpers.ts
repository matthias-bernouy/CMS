export function schemaDetailElement(): HTMLElement {
    const detail = document.createElement("cms-dashboard-w-detail");
    detail.setAttribute(
        "data-config-json",
        JSON.stringify({
            widget: "w-detail",
            id: "productDetail",
            source: { endpoint: "product" },
            actions: [{ id: "save", label: "Save", endpoint: { endpoint: "upsertProduct" } }],
            main: [
                {
                    id: "metadata",
                    title: "Category metadata",
                    fields: [
                        {
                            id: "metadata",
                            label: "Metadata",
                            path: "metadata",
                            type: "schema",
                            schema: {
                                endpoint: "categoryProductFields",
                                params: { categoryId: "$field.primaryCategoryId" },
                                itemsPath: "fields",
                            },
                            exclude: { from: "$field.variantAxes", valuePath: "fieldKey" },
                        },
                    ],
                },
            ],
            aside: [
                {
                    id: "classification",
                    title: "Classification",
                    fields: [
                        {
                            id: "primaryCategoryId",
                            label: "Primary category",
                            path: "primaryCategoryId",
                            type: "number",
                        },
                        {
                            id: "variantAxes",
                            label: "Variant axes",
                            path: "variantAxes",
                            type: "table",
                            editable: true,
                            columns: [
                                { id: "fieldKey", label: "Field", path: "fieldKey", editable: true, type: "text" },
                            ],
                        },
                    ],
                },
            ],
        }),
    );
    detail.setAttribute(
        "data-source-json",
        JSON.stringify({
            id: 42,
            primaryCategoryId: 9,
            metadata: { weight: 300, grip: "L1", legacy: "preserved", optionalText: null },
            variantAxes: [{ fieldKey: "grip" }],
        }),
    );
    detail.setAttribute("data-row-key", "42");
    detail.setAttribute("data-source-id", "commerce");
    return detail;
}
