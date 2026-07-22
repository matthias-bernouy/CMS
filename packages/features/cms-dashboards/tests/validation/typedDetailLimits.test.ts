import { describe, expect, test } from "bun:test";
import {
    DASHBOARD_MAX_NESTED_FIELDS,
    DASHBOARD_MAX_OPTIONS,
    validateDashboard,
    type DashboardField,
} from "@bernouy/cms-dashboards";
import { columns, detail, embeddedLookup, nestedFields, options } from "./typedDetailFixtures";

describe("typed dashboard detail field limits", () => {
    test("accepts every typed field and the exact technical limits", () => {
        const tableColumns = [
            { id: "text", label: "Text", path: "text", editable: true, type: "text" },
            { id: "select", label: "Select", path: "select", editable: true, type: "select", options: options(1) },
            { id: "combo", label: "Combo", path: "combo", editable: true, type: "combobox", lookup: embeddedLookup() },
            { id: "tokens", label: "Tokens", path: "tokens", editable: true, type: "tokens" },
            ...columns(DASHBOARD_MAX_NESTED_FIELDS - 4, 4),
        ];
        const itemFields = [
            { id: "text", label: "Text", path: "text", type: "text" },
            { id: "check", label: "Check", path: "check", type: "checkbox" },
            { id: "select", label: "Select", path: "select", type: "select", options: options(1) },
            { id: "combo", label: "Combo", path: "combo", type: "combobox", lookup: embeddedLookup() },
            ...nestedFields(DASHBOARD_MAX_NESTED_FIELDS - 4, 4),
        ];
        const fields = [
            { id: "quantity", label: "Quantity", path: "quantity", type: "number", min: 0, max: 10, step: 0.5 },
            { id: "enabled", label: "Enabled", path: "enabled", type: "checkbox" },
            { id: "status", label: "Status", path: "status", type: "select", options: options(DASHBOARD_MAX_OPTIONS) },
            {
                id: "matrix",
                label: "Matrix",
                path: "matrix",
                type: "table",
                editable: true,
                addLabel: "Add row",
                columns: tableColumns,
            },
            {
                id: "variantAxes",
                label: "Axes",
                path: "variantAxes",
                type: "reorderable-list",
                itemKey: "id",
                fields: itemFields,
            },
            {
                id: "definition",
                label: "Definition",
                path: "definition",
                type: "schema",
                schema: { endpoint: "schema" },
                exclude: { from: "$field.variantAxes", valuePath: "fieldKey" },
            },
            {
                id: "choice",
                label: "Choice",
                path: "choice",
                type: "combobox",
                lookup: {
                    ...embeddedLookup(),
                    create: {
                        mode: "modal",
                        endpoint: "create",
                        valuePath: "id",
                        labelPath: "name",
                        fields: nestedFields(DASHBOARD_MAX_NESTED_FIELDS),
                    },
                },
            },
        ] as DashboardField[];
        expect(validateDashboard(detail(fields))).toEqual([]);
    });

    test("rejects values above every technical limit", () => {
        const fields = [
            {
                id: "status",
                label: "Status",
                path: "status",
                type: "select",
                options: options(DASHBOARD_MAX_OPTIONS + 1),
            },
            {
                id: "matrix",
                label: "Matrix",
                path: "matrix",
                type: "table",
                columns: columns(DASHBOARD_MAX_NESTED_FIELDS + 1),
            },
            {
                id: "axes",
                label: "Axes",
                path: "axes",
                type: "reorderable-list",
                itemKey: "id",
                fields: nestedFields(DASHBOARD_MAX_NESTED_FIELDS + 1),
            },
            {
                id: "choice",
                label: "Choice",
                path: "choice",
                type: "combobox",
                lookup: {
                    ...embeddedLookup(),
                    create: {
                        mode: "modal",
                        endpoint: "create",
                        valuePath: "id",
                        labelPath: "name",
                        fields: nestedFields(DASHBOARD_MAX_NESTED_FIELDS + 1),
                    },
                },
            },
        ] as DashboardField[];

        expect(validateDashboard(detail(fields))).toEqual(
            expect.arrayContaining([
                `views.0.main.0.fields.0.options must contain at most ${DASHBOARD_MAX_OPTIONS} options`,
                `views.0.main.0.fields.1.columns must contain at most ${DASHBOARD_MAX_NESTED_FIELDS} columns`,
                `views.0.main.0.fields.2.fields must contain at most ${DASHBOARD_MAX_NESTED_FIELDS} fields`,
                `views.0.main.0.fields.3.lookup.create.fields must contain at most ${DASHBOARD_MAX_NESTED_FIELDS} fields`,
            ]),
        );
    });
});
