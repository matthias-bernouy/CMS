import type { EditorDataSourceBodyField } from "../../../../../runtime";
import type { DataSourcePickerSourceParamValue } from "./dataSourceBinding";

export type BindingRow = {
    kind: "param" | "body";
    name: string;
    location: string;
    type?: string;
    required?: boolean;
    description?: string;
};

export function renderBindingRow(
    rowConfig: BindingRow,
    initialValue: DataSourcePickerSourceParamValue | undefined,
): HTMLElement {
    const row = document.createElement("div");
    row.className = "param-row";
    row.dataset.bindingKind = rowConfig.kind;
    row.dataset.paramName = rowConfig.name;
    row.append(
        renderParamHeader(rowConfig),
        renderParamDescription(rowConfig),
        renderParamControls(rowConfig.name, initialValue),
    );
    return row;
}

export function renderBindingHeading(text: string): HTMLElement {
    const heading = document.createElement("div");
    heading.className = "config-heading";
    heading.textContent = text;
    return heading;
}

export function bodyBindingFields(
    fields: EditorDataSourceBodyField[],
): Array<{ name: string; type?: string; required?: boolean }> {
    const rows: Array<{ name: string; type?: string; required?: boolean }> = [];
    for (const field of fields) {
        if (field.path !== "." && field.type !== "object" && field.type !== "array") {
            rows.push({ name: field.path, type: field.type, required: field.required });
        }
    }
    return rows;
}

function renderParamHeader(param: BindingRow): HTMLElement {
    const header = document.createElement("div");
    header.className = "param-header";
    const name = document.createElement("span");
    name.className = "param-name";
    name.textContent = param.required ? `${param.name} *` : param.name;
    const meta = document.createElement("span");
    meta.className = "param-meta";
    meta.append(textSpan(param.location), textSpan(param.type ?? "unknown"));
    header.append(name, meta);
    return header;
}

function renderParamDescription(param: BindingRow): HTMLElement {
    const description = document.createElement("p");
    description.textContent = param.description ?? "";
    description.hidden = !param.description;
    return description;
}

function renderParamControls(name: string, initialValue: DataSourcePickerSourceParamValue | undefined): HTMLElement {
    const controls = document.createElement("div");
    controls.className = "param-controls";

    const mode = document.createElement("select");
    mode.className = "param-mode";
    mode.append(option("queryParam", "Query param"), option("raw", "Raw value"), option("state", "Page state"));

    const value = document.createElement("input");
    value.className = "param-value";
    value.placeholder = name;
    if (initialValue) {
        selectOption(mode, initialValue.from);
        value.value = String(initialValue.from === "raw" ? initialValue.value : initialValue.name);
    }

    controls.append(mode, value);
    return controls;
}

function option(value: string, label: string): HTMLOptionElement {
    const element = document.createElement("option");
    element.value = value;
    element.textContent = label;
    return element;
}

function textSpan(value: string): HTMLElement {
    const element = document.createElement("span");
    element.textContent = value;
    return element;
}

function selectOption(select: HTMLSelectElement, value: string): void {
    const index = Array.from(select.options).findIndex((option) => option.value === value);
    if (index >= 0) {
        select.selectedIndex = index;
    }
}
