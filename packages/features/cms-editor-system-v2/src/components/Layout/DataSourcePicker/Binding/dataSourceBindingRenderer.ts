import type { EditorDataSource } from "../../../../runtime";
import { paramsForBinding, type DataSourcePickerSourceBinding, type DataSourcePickerSourceParamValue } from "./dataSourceBinding";
import { initialAlias } from "../State/dataSourcePickerState";

export function renderBindingConfig(
    source: EditorDataSource,
    initialBinding: DataSourcePickerSourceBinding | null,
): HTMLElement {
    const section = document.createElement("section");
    section.className = "binding-config";
    section.append(renderAliasInput(initialAlias(initialBinding)), renderTriggerSelect(initialBinding?.trigger ?? "auto"));

    const params = source.params ?? [];
    if (params.length === 0) return section;

    const heading = document.createElement("div");
    heading.className = "config-heading";
    heading.textContent = "Request params";
    section.append(heading);

    const initialParams = paramsForBinding(source, initialBinding);
    for (const param of params) section.append(renderParamRow(param, initialParams[param.name]));
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

function renderTriggerSelect(value: "auto" | "submit"): HTMLElement {
    const label = document.createElement("label");
    label.textContent = "Trigger";
    const trigger = document.createElement("select");
    trigger.className = "source-trigger";
    trigger.append(option("auto", "Auto"), option("submit", "Submit"));
    selectOption(trigger, value);
    label.append(trigger);
    return label;
}

function renderParamRow(
    param: NonNullable<EditorDataSource["params"]>[number],
    initialValue: DataSourcePickerSourceParamValue | undefined,
): HTMLElement {
    const row = document.createElement("div");
    row.className = "param-row";
    row.dataset.paramName = param.name;
    row.append(renderParamHeader(param), renderParamDescription(param), renderParamControls(param.name, initialValue));
    return row;
}

function renderParamHeader(param: NonNullable<EditorDataSource["params"]>[number]): HTMLElement {
    const header = document.createElement("div");
    header.className = "param-header";
    const name = document.createElement("span");
    name.className = "param-name";
    name.textContent = param.required ? `${param.name} *` : param.name;
    const meta = document.createElement("span");
    meta.className = "param-meta";
    meta.append(textSpan(param.in), textSpan(param.type ?? "unknown"));
    header.append(name, meta);
    return header;
}

function renderParamDescription(param: NonNullable<EditorDataSource["params"]>[number]): HTMLElement {
    const description = document.createElement("p");
    description.textContent = param.description ?? "";
    description.hidden = !param.description;
    return description;
}

function renderParamControls(
    name: string,
    initialValue: DataSourcePickerSourceParamValue | undefined,
): HTMLElement {
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
        value.value = initialValue.from === "raw" ? initialValue.value : initialValue.name;
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

function selectMode(select: HTMLSelectElement, value: DataSourcePickerSourceParamValue["from"]): void {
    selectOption(select, value);
}

function selectOption(select: HTMLSelectElement, value: string): void {
    const index = Array.from(select.options).findIndex(option => option.value === value);
    if (index >= 0) select.selectedIndex = index;
}
