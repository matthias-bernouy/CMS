import type { ThemeDefinition, ThemeMode, ThemeSettings, ThemeToken, ThemeTokenType } from "@bernouy/cms-content";

import { renderTokenControls } from "./controls";

const TOKEN_TYPES: readonly { value: ThemeTokenType; label: string }[] = [
    { value: "color", label: "Color" },
    { value: "font-family", label: "Font family" },
    { value: "length", label: "Length" },
    { value: "number", label: "Number" },
    { value: "shadow", label: "Shadow" },
    { value: "value", label: "CSS value" },
];

export function renderToken(
    token: ThemeToken,
    settings: ThemeSettings,
    theme: ThemeDefinition,
    mode: ThemeMode,
    catalogEditable: boolean,
): HTMLElement {
    const row = document.createElement("div");
    row.className = "element-row";
    row.dataset.tokenId = token.id;
    row.dataset.tokenType = token.type;
    row.append(renderLabel(token, catalogEditable), renderTokenControls(token, settings, theme, mode));
    return row;
}

function deleteTokenButton(token: ThemeToken): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "delete-token";
    button.dataset.deleteToken = "true";
    button.textContent = "Delete token";
    button.ariaLabel = `Delete ${token.label}`;
    return button;
}

function renderLabel(token: ThemeToken, catalogEditable: boolean): HTMLElement {
    const label = document.createElement("div");
    label.className = "element-label";
    label.append(catalogEditable ? editableLabel(token) : fixedLabel(token));
    const detail = catalogEditable ? editableDescription(token) : fixedDescription(token);
    label.append(detail, technicalDetails(token, catalogEditable));
    return label;
}

function technicalDetails(token: ThemeToken, catalogEditable: boolean): HTMLDetailsElement {
    const details = document.createElement("details");
    details.className = "token-details";
    const summary = document.createElement("summary");
    summary.textContent = "Details";
    const variable = document.createElement("code");
    variable.textContent = `var(--${token.variable})`;
    details.append(summary, variable);
    if (token.defaults?.light !== undefined) {
        const defaultValue = document.createElement("span");
        defaultValue.textContent = `Default: ${token.defaults.light}`;
        details.append(defaultValue);
    }
    if (catalogEditable) {
        details.append(deleteTokenButton(token));
    }
    return details;
}

function editableDescription(token: ThemeToken): HTMLInputElement {
    const input = document.createElement("input");
    input.className = "token-description-input";
    input.type = "text";
    input.value = token.description;
    input.ariaLabel = `Description for ${token.label}`;
    input.dataset.tokenDescription = "true";
    return input;
}

function fixedDescription(token: ThemeToken): HTMLElement {
    const detail = document.createElement("span");
    detail.textContent = token.description;
    return detail;
}

function editableLabel(token: ThemeToken): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const input = document.createElement("input");
    input.className = "token-label-input";
    input.type = "text";
    input.value = token.label;
    input.ariaLabel = `Label for --${token.variable}`;
    input.dataset.tokenLabel = "true";
    const type = document.createElement("select");
    type.className = "token-type-select";
    type.dataset.tokenTypeControl = "true";
    type.ariaLabel = `Type for ${token.label}`;
    type.append(...TOKEN_TYPES.map((item) => option(item.value, item.label, item.value === token.type)));
    type.value = token.type;
    fragment.append(input, type);
    return fragment;
}

function fixedLabel(token: ThemeToken): HTMLElement {
    const name = document.createElement("strong");
    name.className = "token-label-text";
    name.textContent = token.label;
    return name;
}

function option(value: string, label: string, selected: boolean): HTMLOptionElement {
    const element = document.createElement("option");
    element.value = value;
    element.textContent = label;
    element.selected = selected;
    return element;
}
