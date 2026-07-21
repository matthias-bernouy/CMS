import type { EditorDataSource, EditorDataSourceBodyField } from "../../../../runtime";
import {
    paramsForBinding,
    type DataSourcePickerSourceBinding,
    type DataSourcePickerSourceParamValue,
} from "./dataSourceBinding";
import { initialAlias } from "../State/dataSourcePickerState";

export function renderBindingConfig(
    source: EditorDataSource,
    initialBinding: DataSourcePickerSourceBinding | null,
): HTMLElement {
    const section = document.createElement("section");
    section.className = "binding-config";
    section.append(
        renderAliasInput(initialAlias(initialBinding)),
        renderTriggerSelect(initialBinding?.trigger ?? defaultTrigger(source)),
    );

    renderRequestParams(section, source, initialBinding);
    renderRequestBody(section, source, initialBinding);
    return section;
}

function renderAliasInput(value: string): HTMLElement {
    const aliasLabel = document.createElement("label");
    aliasLabel.textContent = "Alias";
    const alias = document.createElement("input");
    alias.className = "source-alias";
    alias.value = value;
    alias.placeholder = "data";
    aliasLabel.append(alias);
    return aliasLabel;
}

function renderTriggerSelect(value: "auto" | "submit" | "change"): HTMLElement {
    const label = document.createElement("label");
    label.textContent = "Trigger";
    const trigger = document.createElement("select");
    trigger.className = "source-trigger";
    trigger.append(option("auto", "Auto"), option("submit", "Submit"), option("change", "Change"));
    selectOption(trigger, value);
    label.append(trigger);
    return label;
}

function defaultTrigger(source: EditorDataSource): "auto" | "submit" {
    return (source.method ?? "GET") === "GET" ? "auto" : "submit";
}

function renderRequestParams(
    section: HTMLElement,
    source: EditorDataSource,
    initialBinding: DataSourcePickerSourceBinding | null,
): void {
    const params = source.params ?? [];
    if (params.length === 0) {
        return;
    }

    section.append(renderHeading("Request params"));

    const initialParams = paramsForBinding(source, initialBinding);
    for (const param of params) {
        section.append(
            renderBindingRow(
                {
                    kind: "param",
                    name: param.name,
                    location: param.in,
                    type: param.type,
                    required: param.required,
                    description: param.description,
                },
                initialParams[param.name],
            ),
        );
    }
}

function renderRequestBody(
    section: HTMLElement,
    source: EditorDataSource,
    initialBinding: DataSourcePickerSourceBinding | null,
): void {
    const fields = bodyBindingFields(source.body?.fields ?? []);
    if (fields.length === 0) {
        return;
    }

    section.append(renderHeading("Request body"));
    for (const field of fields) {
        section.append(
            renderBindingRow(
                {
                    kind: "body",
                    name: field.name,
                    location: "body",
                    type: field.type,
                    required: field.required,
                },
                initialBinding?.body?.[field.name],
            ),
        );
    }
}

type BindingRow = {
    kind: "param" | "body";
    name: string;
    location: string;
    type?: string;
    required?: boolean;
    description?: string;
};

function renderBindingRow(
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

function renderHeading(text: string): HTMLElement {
    const heading = document.createElement("div");
    heading.className = "config-heading";
    heading.textContent = text;
    return heading;
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
        selectMode(mode, initialValue.from);
        value.value = String(initialValue.from === "raw" ? initialValue.value : initialValue.name);
    }

    controls.append(mode, value);
    return controls;
}

function bodyBindingFields(
    fields: EditorDataSourceBodyField[],
): Array<{ name: string; type?: string; required?: boolean }> {
    const rows: Array<{ name: string; type?: string; required?: boolean }> = [];
    for (const field of fields) {
        if (field.path !== "." && isBindableBodyType(field.type)) {
            rows.push({ name: field.path, type: field.type, required: field.required });
        }
    }
    return rows;
}

function isBindableBodyType(type: string | undefined): boolean {
    return type !== "object" && type !== "array";
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

function selectMode(select: HTMLSelectElement, value: DataSourcePickerSourceParamValue["from"]): void {
    selectOption(select, value);
}

function selectOption(select: HTMLSelectElement, value: string): void {
    const index = Array.from(select.options).findIndex((option) => option.value === value);
    if (index >= 0) {
        select.selectedIndex = index;
    }
}
