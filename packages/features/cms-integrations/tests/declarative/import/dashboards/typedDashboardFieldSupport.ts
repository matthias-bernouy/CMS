import type { DashboardField } from "@bernouy/cms-dashboards";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";

export function parsedFields(fields: unknown[]): DashboardField[] {
    return parsedDetail(fields).main[0]!.fields;
}

export function parsedDetail(mainFields: unknown[], asideFields?: unknown[]) {
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
    if (artifact?.type !== "dashboard-view" || artifact.view.view.widgets[0]?.widget !== "w-detail") {
        throw new Error("invalid fixture");
    }
    return artifact.view.view.widgets[0];
}

export const base = (id: string, type: string) => ({ id, label: id, path: id, type });
export const column = (id: string) => ({ id, label: id, path: id });
export const columns = (count: number, offset = 0) =>
    Array.from({ length: count }, (_, index) => column(`c${index + offset}`));
export const nestedFields = (count: number, offset = 0) =>
    Array.from({ length: count }, (_, index) => base(`f${index + offset}`, "text"));
export const options = (count: number) => Array.from({ length: count }, (_, index) => `option${index}`);
export const lookup = () => ({ endpoint: "lookup", itemsPath: "items", valuePath: "id", labelPath: "name" });

export function incoherentNestedEditorCases(): Array<[unknown, RegExp]> {
    const table = (entry: unknown, extra = {}) => ({
        ...base("table", "table"),
        editable: true,
        columns: [entry],
        ...extra,
    });
    const list = (entry: unknown) => ({ ...base("list", "reorderable-list"), itemKey: "id", fields: [entry] });
    return [
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
        [list({ ...base("value", "tokens") }), /type.*must be text, checkbox, select, combobox, media/],
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
}
