import type { EditorDataSource } from "../../../../../runtime";
import { paramsForBinding, type DataSourcePickerSourceBinding } from "./dataSourceBinding";
import { bodyBindingFields, renderBindingHeading, renderBindingRow } from "./dataSourceBindingRows";
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

    section.append(renderBindingHeading("Request params"));

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

    section.append(renderBindingHeading("Request body"));
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

function option(value: string, label: string): HTMLOptionElement {
    const element = document.createElement("option");
    element.value = value;
    element.textContent = label;
    return element;
}

function selectOption(select: HTMLSelectElement, value: string): void {
    const index = Array.from(select.options).findIndex((option) => option.value === value);
    if (index >= 0) {
        select.selectedIndex = index;
    }
}
