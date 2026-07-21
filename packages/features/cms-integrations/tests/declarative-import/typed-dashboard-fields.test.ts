import { describe, expect, test } from "bun:test";
import { DASHBOARD_MAX_NESTED_FIELDS, DASHBOARD_MAX_OPTIONS, type DashboardField } from "@bernouy/cms-dashboards";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";

describe("typed dashboard field parsing", () => {
    test("parses all field contracts without truncating exact limits", () => {
        const fields = parsedFields([
            { ...base("quantity", "number"), min: 0, max: 10, step: 0.5 },
            base("enabled", "checkbox"),
            { ...base("status", "select"), options: options(DASHBOARD_MAX_OPTIONS) },
            {
                ...base("matrix", "table"),
                editable: true,
                addLabel: "Add",
                columns: [
                    { ...column("text"), editable: true, type: "text" },
                    { ...column("select"), editable: true, type: "select", options: ["one"] },
                    { ...column("combo"), editable: true, type: "combobox", lookup: lookup() },
                    { ...column("tokens"), editable: true, type: "tokens" },
                    ...columns(DASHBOARD_MAX_NESTED_FIELDS - 4, 4),
                ],
            },
            {
                ...base("axis", "reorderable-list"),
                itemKey: "id",
                fields: [
                    { ...base("text", "text") },
                    { ...base("check", "checkbox") },
                    { ...base("select", "select"), options: ["one"] },
                    { ...base("combo", "combobox"), lookup: lookup() },
                    ...nestedFields(DASHBOARD_MAX_NESTED_FIELDS - 4, 4),
                ],
            },
            {
                ...base("definition", "schema"),
                schema: { endpoint: "schema" },
                exclude: { from: "$field.axis", valuePath: "fieldKey" },
            },
        ]);

        expect(fields[0]).toMatchObject({ type: "number", min: 0, max: 10, step: 0.5 });
        expect(fields[1]).toMatchObject({ type: "checkbox" });
        expect((fields[2] as any).options).toHaveLength(DASHBOARD_MAX_OPTIONS);
        expect((fields[3] as any).columns).toHaveLength(DASHBOARD_MAX_NESTED_FIELDS);
        expect((fields[3] as any).columns[3]).toMatchObject({ editable: true, type: "tokens" });
        expect((fields[4] as any).fields).toHaveLength(DASHBOARD_MAX_NESTED_FIELDS);
        expect(fields[5]).toMatchObject({ type: "schema", exclude: { from: "$field.axis", valuePath: "fieldKey" } });
    });

    test("rejects arrays above each technical limit before parsing entries", () => {
        const tooManyOptions = Array(DASHBOARD_MAX_OPTIONS + 1).fill(null);
        const tooManyNested = Array(DASHBOARD_MAX_NESTED_FIELDS + 1).fill(null);
        const cases: Array<[unknown, RegExp]> = [
            [{ ...base("select", "select"), options: tooManyOptions }, /at most 256 options/],
            [{ ...base("table", "table"), columns: tooManyNested }, /at most 64 entries/],
            [{ ...base("list", "reorderable-list"), itemKey: "id", fields: tooManyNested }, /at most 64 entries/],
            [
                {
                    ...base("combo", "combobox"),
                    lookup: {
                        ...lookup(),
                        create: {
                            mode: "modal",
                            endpoint: "create",
                            valuePath: "id",
                            labelPath: "name",
                            fields: tooManyNested,
                        },
                    },
                },
                /at most 64 fields/,
            ],
        ];
        for (const [field, error] of cases) {
            expect(() => parsedFields([field])).toThrow(error);
        }
    });

    test("rejects malformed numbers and optional booleans", () => {
        const cases: Array<[unknown, RegExp]> = [
            [{ ...base("number", "number"), min: Infinity }, /min.*finite number/],
            [{ ...base("number", "number"), step: 0 }, /step.*greater than zero/],
            [{ ...base("number", "number"), min: 2, max: 1 }, /max.*greater than or equal to min/],
            [{ ...base("text", "text"), required: "yes" }, /required.*boolean/],
            [{ ...base("table", "table"), editable: "yes", columns: [column("value")] }, /editable.*boolean/],
        ];
        for (const [field, error] of cases) {
            expect(() => parsedFields([field])).toThrow(error);
        }
    });

    test("rejects incoherent nested editors and duplicate ids", () => {
        const table = (entry: unknown, extra = {}) => ({
            ...base("table", "table"),
            editable: true,
            columns: [entry],
            ...extra,
        });
        const list = (entry: unknown) => ({ ...base("list", "reorderable-list"), itemKey: "id", fields: [entry] });
        const cases: Array<[unknown, RegExp]> = [
            [{ ...base("table", "table"), columns: [{ ...column("value"), editable: true }] }, /table is editable/],
            [table({ ...column("value"), type: "text" }), /column is editable/],
            [{ ...base("table", "table"), addLabel: "Add", columns: [column("value")] }, /requires an editable table/],
            [{ ...base("table", "table"), columns: [column("same"), column("same")] }, /id.*duplicated/],
            [
                table({ ...column("value"), editable: true, type: "checkbox" }),
                /type.*must be text, select, combobox, tokens/,
            ],
            [table({ ...column("value"), editable: true, type: "tokens", options: ["one"] }), /options.*not supported/],
            [table({ ...column("value"), editable: true, value: "list" }), /value.*not supported/],
            [list({ ...base("value", "tokens") }), /type.*must be text, checkbox, select, combobox/],
            [list({ ...base("value", "text"), options: ["one"] }), /options.*not supported/],
            [list({ ...base("value", "select") }), /options.*required/],
            [list({ ...base("value", "combobox") }), /declare options or lookup/],
            [list({ ...base("value", "combobox"), lookup: { ...lookup(), create: null } }), /create.*not supported/],
            [
                list({ ...base("value", "combobox"), lookup: { ...lookup(), descriptionPaths: ["name"] } }),
                /descriptionPaths.*not supported/,
            ],
            [
                {
                    ...base("list", "reorderable-list"),
                    itemKey: "id",
                    fields: [base("same", "text"), base("same", "checkbox")],
                },
                /id.*duplicated/,
            ],
            [
                {
                    ...base("combo", "combobox"),
                    lookup: {
                        ...lookup(),
                        create: {
                            mode: "modal",
                            endpoint: "create",
                            valuePath: "id",
                            labelPath: "name",
                            fields: [base("same", "text"), base("same", "checkbox")],
                        },
                    },
                },
                /id.*duplicated/,
            ],
        ];
        for (const [field, error] of cases) {
            expect(() => parsedFields([field])).toThrow(error);
        }
    });

    test("rejects unsafe, extra, and legacy schema exclusions", () => {
        const schema = (extra: Record<string, unknown>) => ({
            ...base("schema", "schema"),
            schema: { endpoint: "schema" },
            exclude: { from: "$field.axis", valuePath: "fieldKey" },
            ...extra,
        });
        const cases: Array<[unknown, RegExp]> = [
            [schema({ exclude: { from: "$resource.axis", valuePath: "fieldKey" } }), /from.*\$field expression/],
            [schema({ exclude: { from: "$field.__proto__.axis", valuePath: "fieldKey" } }), /from.*safe dotted/],
            [schema({ exclude: { from: "$field.axis", valuePath: "prototype.key" } }), /valuePath.*safe dotted/],
            [
                schema({ exclude: { from: "$field.axis", valuePath: "fieldKey", extra: true } }),
                /only contain from and valuePath/,
            ],
            [schema({ reloadOn: "$field.axis" }), /reloadOn.*not supported/],
            [schema({ excludeKeysFrom: "$field.axis" }), /excludeKeysFrom.*not supported/],
        ];
        for (const [field, error] of cases) {
            expect(() => parsedFields([base("axis", "text"), field])).toThrow(error);
        }
    });

    test("parses schema exclusions that reference a field in another detail section", () => {
        const detail = parsedDetail(
            [
                {
                    ...base("schema", "schema"),
                    schema: { endpoint: "schema" },
                    exclude: { from: "$field.axis", valuePath: "fieldKey" },
                },
            ],
            [base("axis", "text")],
        );

        expect(detail.main[0]!.fields[0]).toMatchObject({ exclude: { from: "$field.axis" } });
        expect(detail.aside?.[0]?.fields[0]).toMatchObject({ id: "axis" });
    });

    test("rejects duplicate option values", () => {
        expect(() => parsedFields([{ ...base("select", "select"), options: ["same", "same"] }])).toThrow(
            /value.*duplicated/,
        );
    });
});

function parsedFields(fields: unknown[]): DashboardField[] {
    return parsedDetail(fields).main[0]!.fields;
}

function parsedDetail(mainFields: unknown[], asideFields?: unknown[]) {
    const parsed = parseIntegrationDefinition({
        kind: "typed",
        label: "Typed",
        inputs: [],
        artifacts: [
            {
                type: "dashboard",
                dashboard: {
                    id: "typed",
                    source: "typed",
                    views: [
                        {
                            widget: "w-detail",
                            id: "detail",
                            source: { endpoint: "resource" },
                            main: [{ id: "main", title: "Main", fields: mainFields }],
                            ...(asideFields ? { aside: [{ id: "aside", title: "Aside", fields: asideFields }] } : {}),
                        },
                    ],
                },
            },
        ],
    });
    const artifact = parsed.artifacts?.[0];
    if (artifact?.type !== "dashboard" || artifact.dashboard.views[0]?.widget !== "w-detail") {
        throw new Error("invalid fixture");
    }
    return artifact.dashboard.views[0];
}

const base = (id: string, type: string) => ({ id, label: id, path: id, type });
const column = (id: string) => ({ id, label: id, path: id });
const columns = (count: number, offset = 0) =>
    Array.from({ length: count }, (_, index) => column(`c${index + offset}`));
const nestedFields = (count: number, offset = 0) =>
    Array.from({ length: count }, (_, index) => base(`f${index + offset}`, "text"));
const options = (count: number) => Array.from({ length: count }, (_, index) => `option${index}`);
const lookup = () => ({ endpoint: "lookup", itemsPath: "items", valuePath: "id", labelPath: "name" });
