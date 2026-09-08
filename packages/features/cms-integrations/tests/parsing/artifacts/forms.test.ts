import { expect, test } from "bun:test";
import { parseWidget } from "cms-integrations/core/parsing/artifacts/dashboard/widgets";

const fields = [
    {
        id: "title",
        path: "title",
        label: "Title",
        type: "text",
        name: "values[title]",
        empty: "null",
        valueType: "string",
    },
];
const operation = {
    endpoint: "saveProduct",
    hiddenFields: [{ name: "id", value: "$resource.id", type: "string" }],
    refresh: "read",
};

function detail(extra: Record<string, unknown> = {}) {
    return {
        widget: "w-detail",
        id: "product",
        source: { endpoint: "getProduct" },
        main: [{ id: "main", title: "Product", fields }],
        ...extra,
    };
}

test("retains real form contracts when parsing installed dashboard widgets", () => {
    const raw = detail({
        save: operation,
        delete: { ...operation, confirm: "Delete?" },
        actions: [{ id: "archive", label: "Archive", form: { ...operation, fields } }],
    });
    expect(parseWidget(raw, "widget")).toEqual(raw);
    const create = { viewId: "product", presentation: "modal", title: "Create product" };
    const table = {
        widget: "w-table",
        id: "products",
        source: { endpoint: "listProducts" },
        rowKey: "id",
        columns: [{ id: "title", path: "title", label: "Title" }],
        create,
    };
    expect(parseWidget(table, "widget")).toEqual(table);
});

test("retains save media and modal lookup form metadata", () => {
    const input = detail();
    input.main[0]!.fields = [
        {
            id: "media",
            path: "media",
            label: "Images",
            type: "media",
            name: "mediaIds",
            persist: "save",
            item: { idPath: "id", urlPath: "url" },
        },
        {
            id: "brand",
            path: "brandId",
            label: "Brand",
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
    ] as unknown as typeof fields;
    expect(parseWidget(input, "widget")).toEqual(input);
});

test("rejects invalid refresh, technical payloads and conflicting legacy mappings", () => {
    for (const save of [
        { ...operation, refresh: "response" },
        { ...operation, body: {} },
        { ...operation, params: {} },
        { ...operation, hiddenFields: [{ name: "draft", type: "string", value: {} }] },
    ]) {
        expect(() => parseWidget(detail({ save }), "widget")).toThrow();
    }
    expect(() => parseWidget(detail({ delete: operation }), "widget")).toThrow("confirm");
});

test("refuses modal features without an isolated data context instead of silently dropping them", () => {
    const table = {
        widget: "w-table",
        id: "products",
        source: { endpoint: "listProducts" },
        rowKey: "id",
        columns: [{ id: "title", path: "title", label: "Title" }],
    };
    const create = { endpoint: "createProduct", mode: "modal", fields };
    expect(() =>
        parseWidget({ ...table, create: { ...create, source: { endpoint: "newProduct" } } }, "widget"),
    ).toThrow("reference a detail view");
    expect(() => parseWidget(detail({ save: { ...operation, refresh: "none" } }), "widget")).toThrow("saving reloads");
    for (const field of [
        { id: "price", path: "price", label: "Price", type: "media", item: { urlPath: "url" } },
        { ...fields[0], visibleWhen: { value: "$field.title", equals: "yes" } },
        {
            id: "brand",
            path: "brand",
            label: "Brand",
            type: "combobox",
            lookup: { endpoint: "searchBrands", valuePath: "id", labelPath: "name" },
        },
    ]) {
        expect(() =>
            parseWidget(
                detail({ actions: [{ id: "operate", label: "Operate", form: { ...operation, fields: [field] } }] }),
                "widget",
            ),
        ).toThrow("not supported by modal forms");
    }
});

test("preserves an editable table's scalar row identity path", () => {
    const field = {
        id: "axes",
        path: "axes",
        label: "Axes",
        type: "table",
        editable: true,
        rowKey: "key",
        columns: [{ id: "value", path: "values", label: "Values", editable: true, type: "tokens" }],
    };
    const input = { ...detail(), main: [{ id: "main", title: "Main", fields: [field] }] };
    expect(parseWidget(input, "widget")).toEqual(input);
    expect(() =>
        parseWidget(
            { ...input, main: [{ id: "main", title: "Main", fields: [{ ...field, rowKey: "__proto__.key" }] }] },
            "widget",
        ),
    ).toThrow("safe dotted data path");
});

test("parses unified creation capability, optional identity and staged media sessions", () => {
    const raw = detail({
        create: {},
        save: {
            ...operation,
            idPath: "resource.id",
            hiddenFields: [{ name: "id", value: "$resource.id", type: "number", empty: "omit" }],
        },
    });
    expect(parseWidget(raw, "widget")).toEqual(raw);
    for (const create of [true, { endpoint: "createProduct" }]) {
        expect(() => parseWidget(detail({ create }), "widget")).toThrow();
    }
    const input = {
        ...detail(),
        main: [
            {
                id: "main",
                title: "Main",
                fields: [
                    {
                        id: "media",
                        label: "Media",
                        path: "media",
                        type: "media",
                        persist: "save",
                        staging: { sessionField: "uploadSessionId" },
                        item: { idPath: "id", urlPath: "url" },
                        actions: { upload: { endpoint: "stage" } },
                    },
                ],
            },
        ],
    };
    expect(parseWidget(input, "widget")).toEqual(input);
});

test("accepts monetary action fields with resource currency and decimal rules", () => {
    const field = {
        id: "minimum",
        name: "minimumAmount",
        path: "priceRule.minimumAmount",
        label: "Minimum",
        type: "money",
        currencyPath: "currency",
        allowDecimals: { value: "$resource.wholeUnitPrices", equals: false },
    };
    const parsed = parseWidget(
        detail({ actions: [{ id: "price", label: "Request price", form: { ...operation, fields: [field] } }] }),
        "widget",
    );
    expect(parsed).toMatchObject({ actions: [{ form: { fields: [field] } }] });
});

test("integration view parsing rejects removed settings targets", () => {
    const target = { management: { installationId: "emailer", operation: "settings" } };
    expect(() => parseWidget(detail({ source: target }), "detail")).toThrow("named action");
    expect(() => parseWidget(detail({ save: target }), "detail")).toThrow("named action");
});

test("preserves explicit navigation identities and rejects invalid paths", () => {
    const action = { id: "parent", label: "Parent", selection: { opens: "parentDetail", row: "$resource.parentId" } };
    const raw = detail({ actions: [action] });
    expect(parseWidget(raw, "widget")).toEqual(raw);
    for (const row of ["", "$result.id", "$resource.constructor.id", 42]) {
        expect(() =>
            parseWidget(detail({ actions: [{ ...action, selection: { ...action.selection, row } }] }), "widget"),
        ).toThrow();
    }
});

test("parses native named management save targets without a mapped JSON body", () => {
    const save = {
        management: { installationId: "provider", operation: "action", actionId: "publish" },
        valuesPath: "input",
        hiddenFields: [{ name: "input[expectedVersion]", type: "string", value: "$resource.revision" }],
    };
    expect(parseWidget(detail({ save }), "view")).toMatchObject({ save });
    expect(() =>
        parseWidget(detail({ save: { ...save, management: { ...save.management, actionId: "" } } }), "view"),
    ).toThrow();
});
