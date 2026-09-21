import { expect, test } from "bun:test";
import { validateDashboard, type Dashboard, type DashboardFormOperation } from "@bernouy/cms-dashboards";
import { productSource } from "../validation/dashboardSourceFixture";
import { validDashboard } from "../validation/validDashboardFixture";

function fixture() {
    const dashboard = validDashboard();
    const detail = dashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;
    const table = dashboard.views[0] as Extract<Dashboard["views"][number], { widget: "w-table" }>;
    const source = structuredClone(productSource);
    source.endpoints.find((endpoint) => endpoint.urn === "urn:products:updateProduct")!.method = "PATCH";
    source.endpoints.find((endpoint) => endpoint.urn === "urn:products:createBrand")!.method = "POST";
    source.endpoints.find((endpoint) => endpoint.urn === "urn:products:deleteProduct")!.method = "DELETE";
    detail.create = {};
    detail.save = {
        endpoint: "updateProduct",
        hiddenFields: [
            { name: "id", value: "$resource.id", type: "string" },
            { name: "revision", value: "$resource.version", type: "number" },
        ],
    };
    return { dashboard, detail, table, source };
}

test("accepts independent forms, scalar technical fields, modal creation and draft media", () => {
    const { dashboard, detail, table, source } = fixture();
    detail.delete = { endpoint: "deleteProduct", confirm: "Delete this product?" };
    detail.actions = [
        {
            id: "archive",
            label: "Archive",
            form: {
                endpoint: "updateProduct",
                refresh: "read",
                hiddenFields: [{ name: "status", type: "string", value: "archived" }],
                fields: [
                    { id: "reason", path: "reason", label: "Reason", type: "text" },
                    {
                        id: "minimum",
                        path: "priceRule.minimumAmount",
                        name: "minimumAmount",
                        label: "Minimum",
                        type: "money",
                        currencyPath: "currency",
                        allowDecimals: { value: "$resource.wholeUnitPrices", equals: false },
                    },
                ],
            },
        },
    ];
    table.create = { viewId: "productDetail", presentation: "modal" };
    const section = detail.main[1]!;
    if ("fields" in section) {
        section.fields = [
            {
                id: "media",
                type: "media",
                path: "media",
                name: "mediaIds",
                label: "Media",
                persist: "save",
                staging: { sessionField: "uploadSessionId" },
                item: { idPath: "id", urlPath: "url" },
                actions: { upload: { endpoint: "uploadProductImage" } },
            },
        ];
    }
    expect(validateDashboard(dashboard, { source })).toEqual([]);
});

test("rejects forged hidden values and unsafe or conflicting control names", () => {
    for (const [hidden, expected] of [
        [{ name: "id", value: "$field.title", type: "string" }, "stable resource"],
        [{ name: "id", value: "$resource", type: "string" }, "stable resource"],
        [{ name: "id", value: { id: "secret" }, type: "string" }, "scalar matching"],
        [{ name: "id", value: Infinity, type: "number" }, "scalar matching"],
        [{ name: "__proto__[polluted]", value: "x", type: "string" }, "safe form name"],
        [{ name: "title", value: "x", type: "string" }, "conflicts"],
        [{ name: "title[nested]", value: "x", type: "string" }, "conflicts"],
    ] as const) {
        const { dashboard, detail, source } = fixture();
        detail.save!.hiddenFields = [hidden] as DashboardFormOperation["hiddenFields"];
        expect(validateDashboard(dashboard, { source }).some((error) => error.includes(expected))).toBe(true);
    }
});

test("rejects response refresh, arbitrary body maps, unknown endpoints and GET mutations", () => {
    for (const [patch, expected] of [
        [{ refresh: "response" }, "read or none"],
        [{ body: { title: "$field.title" } }, "body is not supported"],
        [{ endpoint: "missing" }, "unknown endpoint"],
        [{ endpoint: "getProduct" }, "request body"],
    ] as const) {
        const { dashboard, detail, source } = fixture();
        Object.assign(detail.save!, patch);
        expect(validateDashboard(dashboard, { source }).some((error) => error.includes(expected))).toBe(true);
    }
});

test("requires deletion confirmation and validates creation navigation identity", () => {
    const { dashboard, detail, table, source } = fixture();
    detail.delete = { endpoint: "deleteProduct", confirm: "" };
    table.create = { viewId: "missing", presentation: "modal" };
    const errors = validateDashboard(dashboard, { source });
    expect(errors).toContain("views.1.delete.confirm is required");
    expect(errors).toContain('views.0.create.viewId references unknown detail view "missing"');
});

test("keeps valuesPath apart from stable technical fields", () => {
    const { dashboard, detail, source } = fixture();
    detail.save!.valuesPath = "values";
    detail.save!.hiddenFields!.push({ name: "title", type: "string", value: "Technical title" });
    expect(validateDashboard(dashboard, { source })).toEqual([]);
    detail.save!.hiddenFields!.push({ name: "values[title]", type: "string", value: "Collision" });
    expect(validateDashboard(dashboard, { source }).some((error) => error.includes("conflicts"))).toBe(true);
});

test("rejects duplicated creation forms and requires a reusable detail save", () => {
    const { dashboard, detail, table, source } = fixture();
    Object.assign(detail.save!, { refresh: "none" });
    table.create = { viewId: "productDetail", presentation: "modal" };
    Object.assign(table.create, { fields: [], endpoint: "createBrand" });
    const errors = validateDashboard(dashboard, { source });
    expect(errors).toContain("views.1.save.refresh must be read: saving reloads the common source");
    expect(errors).toContain("views.0.create.fields is not supported: reference a detail view");
    delete detail.save;
    expect(validateDashboard(dashboard, { source })).toContain("views.1.save is required for detail creation");
});

test("creation omits empty identity but validates response identity and staging field collisions", () => {
    const { dashboard, detail, source } = fixture();
    detail.save!.hiddenFields![0]!.empty = "omit";
    detail.save!.idPath = "resource.id";
    expect(validateDashboard(dashboard, { source })).toEqual([]);
    detail.save!.idPath = "__proto__.id";
    expect(validateDashboard(dashboard, { source })).toContain("views.1.save.idPath must be a safe dotted data path");
});
