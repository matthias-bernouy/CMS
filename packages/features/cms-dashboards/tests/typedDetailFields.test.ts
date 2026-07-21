import { describe, expect, test } from "bun:test";
import {
    DASHBOARD_MAX_NESTED_FIELDS,
    DASHBOARD_MAX_OPTIONS,
    validateDashboard,
    type Dashboard,
    type DashboardField,
} from "@bernouy/cms-dashboards";

describe("typed dashboard detail fields", () => {
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

    test("rejects unsafe or legacy schema exclusions", () => {
        const valid = {
            id: "schema",
            label: "Schema",
            path: "schema",
            type: "schema",
            schema: { endpoint: "schema" },
            exclude: { from: "$field.axis", valuePath: "fieldKey" },
        };
        const cases: Array<[Record<string, unknown>, string]> = [
            [
                { ...valid, exclude: { from: "$resource.axis", valuePath: "fieldKey" } },
                "exclude.from must be a $field expression",
            ],
            [
                { ...valid, exclude: { from: "$field", valuePath: "fieldKey" } },
                "exclude.from must be a $field expression",
            ],
            [
                { ...valid, exclude: { from: "$field.__proto__.axis", valuePath: "fieldKey" } },
                "exclude.from must be a $field expression",
            ],
            [
                { ...valid, exclude: { from: "$field.missing", valuePath: "fieldKey" } },
                'references unknown field "missing"',
            ],
            [
                { ...valid, exclude: { from: "$field.axis", valuePath: "prototype.key" } },
                "valuePath must be a safe dotted data path",
            ],
            [
                { ...valid, exclude: { from: "$field.axis", valuePath: "fieldKey", extra: true } },
                "unsupported properties",
            ],
            [{ ...valid, reloadOn: "$field.axis" }, "reloadOn is not supported"],
            [{ ...valid, excludeKeysFrom: "$field.axis" }, "excludeKeysFrom is not supported"],
        ];
        for (const [candidate, message] of cases) {
            expect(
                validateDashboard(
                    detail([{ id: "axis", label: "Axis", path: "axis", type: "text" }, candidate as DashboardField]),
                ).join("\n"),
            ).toContain(message);
        }
    });

    test("resolves schema exclusions across main and aside sections", () => {
        const dashboard = detail([
            {
                id: "schema",
                label: "Schema",
                path: "schema",
                type: "schema",
                schema: { endpoint: "schema" },
                exclude: { from: "$field.axis", valuePath: "fieldKey" },
            },
        ]);
        const widget = dashboard.views[0];
        if (widget?.widget !== "w-detail") {
            throw new Error("invalid fixture");
        }
        widget.aside = [
            { id: "aside", title: "Aside", fields: [{ id: "axis", label: "Axis", path: "axis", type: "text" }] },
        ];

        expect(validateDashboard(dashboard)).toEqual([]);
    });

    test("rejects incoherent nested editors and duplicate ids", () => {
        const fields = [
            {
                id: "readonly",
                label: "Readonly",
                path: "readonly",
                type: "table",
                addLabel: "Add",
                columns: [
                    { id: "same", label: "A", path: "a", editable: true },
                    { id: "same", label: "B", path: "b", editable: false },
                ],
            },
            {
                id: "table",
                label: "Table",
                path: "table",
                type: "table",
                editable: true,
                columns: [
                    { id: "check", label: "Check", path: "check", editable: true, type: "checkbox" },
                    { id: "text", label: "Text", path: "text", type: "text" },
                    { id: "legacy", label: "Legacy", path: "legacy", editable: true, value: "list" },
                ],
            },
            {
                id: "items",
                label: "Items",
                path: "items",
                type: "reorderable-list",
                itemKey: "id",
                fields: [
                    { id: "token", label: "Token", path: "token", type: "tokens" },
                    { id: "text", label: "Text", path: "text", type: "text", lookup: embeddedLookup() },
                    {
                        id: "combo",
                        label: "Combo",
                        path: "combo",
                        type: "combobox",
                        lookup: { ...embeddedLookup(), create: null },
                    },
                ],
            },
            {
                id: "modal",
                label: "Modal",
                path: "modal",
                type: "combobox",
                lookup: {
                    ...embeddedLookup(),
                    create: {
                        mode: "modal",
                        endpoint: "create",
                        valuePath: "id",
                        labelPath: "name",
                        fields: [
                            { id: "same", label: "A", path: "a", type: "text" },
                            { id: "same", label: "B", path: "b", type: "checkbox" },
                        ],
                    },
                },
            },
        ] as unknown as DashboardField[];
        const errors = validateDashboard(detail(fields));

        expect(errors.join("\n")).toContain("addLabel requires an editable table");
        expect(errors.join("\n")).toContain("columns.1.id is duplicated");
        expect(errors.join("\n")).toContain("cannot configure editing unless the table is editable");
        expect(errors.join("\n")).toContain("columns.0.type is not supported");
        expect(errors.join("\n")).toContain("cannot configure an editor unless the column is editable");
        expect(errors.join("\n")).toContain("columns.2.value is not supported; use type");
        expect(errors.join("\n")).toContain("fields.0.type is not supported");
        expect(errors.join("\n")).toContain("lookup is only supported for combobox editors");
        expect(errors.join("\n")).toContain("lookup.create is not supported");
        expect(errors.join("\n")).toContain('duplicate field id "same"');
    });

    test("validates number constraints and accepts editable false as readonly", () => {
        const fields = [
            { id: "number", label: "Number", path: "number", type: "number", min: 10, max: 5, step: 0 },
            { id: "finite", label: "Finite", path: "finite", type: "number", min: Infinity },
            {
                id: "table",
                label: "Table",
                path: "table",
                type: "table",
                columns: [{ id: "value", label: "Value", path: "value", editable: false }],
            },
        ] as DashboardField[];
        expect(validateDashboard(detail(fields))).toEqual(
            expect.arrayContaining([
                "views.0.main.0.fields.0.step must be greater than zero",
                "views.0.main.0.fields.0.max must be greater than or equal to min",
                "views.0.main.0.fields.1.min must be a finite number",
            ]),
        );
    });
});

function detail(fields: DashboardField[]): Dashboard {
    return {
        id: "typed",
        source: "typed",
        views: [
            {
                widget: "w-detail",
                id: "detail",
                source: { endpoint: "resource" },
                main: [{ id: "main", title: "Main", fields }],
            },
        ],
    };
}

const options = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ value: `v${index}`, label: `V${index}` }));
const columns = (count: number, offset = 0) =>
    Array.from({ length: count }, (_, index) => ({
        id: `column${index + offset}`,
        label: `Column ${index + offset}`,
        path: `column${index + offset}`,
    }));
const nestedFields = (count: number, offset = 0) =>
    Array.from({ length: count }, (_, index) => ({
        id: `field${index + offset}`,
        label: `Field ${index + offset}`,
        path: `field${index + offset}`,
        type: "text" as const,
    }));
const embeddedLookup = () => ({ endpoint: "lookup", itemsPath: "items", valuePath: "id", labelPath: "name" });
