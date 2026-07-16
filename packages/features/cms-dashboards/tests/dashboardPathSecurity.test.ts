import { describe, expect, test } from "bun:test";
import {
    isDashboardVisibilityExpression,
    isSafeDashboardExpression,
    isSafeDashboardPath,
    validateDashboard,
    type Dashboard,
    type DashboardEmbeddedLookupRef,
} from "@bernouy/cms-dashboards";

describe("dashboard data path security", () => {
    test("accepts ordinary dotted paths and rejects prototype segments", () => {
        expect(isSafeDashboardPath("profile.company.name")).toBe(true);
        expect(isSafeDashboardPath("profile.__proto__.polluted")).toBe(false);
        expect(isSafeDashboardPath("constructor.prototype.polluted")).toBe(false);
        expect(isSafeDashboardPath("profile..name")).toBe(false);
        expect(isSafeDashboardExpression("$field.profile.name", ["field"])).toBe(true);
        expect(isSafeDashboardExpression("$field.__proto__.polluted", ["field"])).toBe(false);
        expect(isDashboardVisibilityExpression("$resource.constructor.name")).toBe(false);
    });

    test("rejects unsafe field and action body paths", () => {
        const dashboard: Dashboard = {
            id: "users",
            source: "users",
            views: [{
                widget: "w-detail",
                id: "userDetail",
                source: { endpoint: "user" },
                actions: [{
                    id: "save",
                    label: "Save",
                    endpoint: {
                        endpoint: "saveUser",
                        body: {
                            name: "$field.__proto__.polluted",
                            "__proto__.polluted": "$field.name",
                        },
                    },
                    after: {
                        opens: "userDetail",
                        row: "$result.constructor.prototype",
                    },
                }],
                main: [{
                    id: "general",
                    title: "General",
                    fields: [{
                        id: "name",
                        label: "Name",
                        path: "profile.__proto__.polluted",
                        type: "text",
                    }, {
                        id: "links",
                        label: "Links",
                        path: "links",
                        type: "reorderable-list",
                        itemKey: "__proto__.id",
                        positionPath: "constructor.position",
                        fields: [{
                            id: "label",
                            label: "Label",
                            path: "prototype.label",
                        }],
                    }],
                }],
            }],
        };

        expect(validateDashboard(dashboard)).toEqual(expect.arrayContaining([
            "views.0.actions.0.endpoint.body.__proto__.polluted must be a safe dotted data path",
            "views.0.actions.0.endpoint.body.name has an invalid binding expression",
            "views.0.actions.0.after.row has an invalid binding expression",
            "views.0.main.0.fields.0.path must be a safe dotted data path",
            "views.0.main.0.fields.1.itemKey must be a safe dotted data path",
            "views.0.main.0.fields.1.positionPath must be a safe dotted data path",
            "views.0.main.0.fields.1.fields.0.path must be a safe dotted data path",
        ]));
    });

    test("only accepts local resource selections for every lookup field", () => {
        const topLookup = lookup("$resource.brand");
        const tableLookup = lookup("$resource.rows.brand");
        const reorderableLookup = lookup("$resource.items.product");
        const dashboard: Dashboard = {
            id: "products",
            source: "products",
            views: [{
                widget: "w-detail",
                id: "productDetail",
                source: { endpoint: "product" },
                main: [{
                    id: "general",
                    title: "General",
                    fields: [{
                        id: "brand",
                        label: "Brand",
                        path: "brandId",
                        type: "combobox",
                        lookup: topLookup,
                    }, {
                        id: "rows",
                        label: "Rows",
                        path: "rows",
                        type: "table",
                        editable: true,
                        columns: [{
                            id: "brand",
                            label: "Brand",
                            path: "brandId",
                            editable: true,
                            type: "combobox",
                            lookup: tableLookup,
                        }],
                    }, {
                        id: "items",
                        label: "Items",
                        path: "items",
                        type: "reorderable-list",
                        itemKey: "id",
                        fields: [{
                            id: "product",
                            label: "Product",
                            path: "productId",
                            type: "combobox",
                            lookup: reorderableLookup,
                        }],
                    }],
                }],
            }],
        };

        expect(validateDashboard(dashboard)).toEqual([]);

        topLookup.selected = "$resource.__proto__.brand" as never;
        tableLookup.selected = "$field.brand" as never;
        reorderableLookup.selected = { endpoint: "product", params: { id: "$value" } } as never;

        expect(validateDashboard(dashboard)).toEqual(expect.arrayContaining([
            "views.0.main.0.fields.0.lookup.selected must be a $resource expression with a safe dotted data path",
            "views.0.main.0.fields.1.columns.0.lookup.selected must be a $resource expression with a safe dotted data path",
            "views.0.main.0.fields.2.fields.0.lookup.selected must be a $resource expression with a safe dotted data path",
        ]));

        topLookup.selected = "$resource" as never;
        expect(validateDashboard(dashboard)).toContain(
            "views.0.main.0.fields.0.lookup.selected must be a $resource expression with a safe dotted data path",
        );
    });
});

function lookup(selected: DashboardEmbeddedLookupRef["selected"]): DashboardEmbeddedLookupRef {
    return {
        endpoint: "options",
        itemsPath: "items",
        valuePath: "id",
        labelPath: "label",
        selected,
    };
}
