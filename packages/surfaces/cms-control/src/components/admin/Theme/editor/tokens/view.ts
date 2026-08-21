import type { ThemeDefinition, ThemeMode, ThemeSettings, ThemeToken, ThemeTokenType } from "@bernouy/cms-content";

import { renderTokenControls } from "./controls";

const TOKEN_TYPE_LABELS: Record<ThemeTokenType, string> = {
    color: "Color",
    "font-family": "Font family",
    length: "Length",
    number: "Number",
    shadow: "Shadow",
    value: "CSS value",
};

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
    if (catalogEditable) {
        row.classList.add("catalog-editable");
        row.append(editTokenButton(token));
    }
    return row;
}

function editTokenButton(token: ThemeToken): HTMLElement {
    const button = document.createElement("p9r-button");
    button.className = "edit-token";
    button.setAttribute("type", "button");
    button.setAttribute("variant", "ghost");
    button.dataset.editToken = "true";
    button.textContent = "Edit";
    button.ariaLabel = `Edit ${token.label}`;
    return button;
}

function renderLabel(token: ThemeToken, catalogEditable: boolean): HTMLElement {
    const label = document.createElement("div");
    label.className = "element-label";
    label.append(fixedLabel(token), fixedDescription(token));
    if (catalogEditable) {
        label.append(tokenType(token));
    }
    return label;
}

function fixedDescription(token: ThemeToken): HTMLElement {
    const detail = document.createElement("span");
    detail.className = "token-description";
    detail.dataset.tokenDescriptionText = "true";
    detail.textContent = token.description;
    return detail;
}

function tokenType(token: ThemeToken): HTMLElement {
    const type = document.createElement("span");
    type.className = "token-type-label";
    type.dataset.tokenTypeLabel = "true";
    type.textContent = TOKEN_TYPE_LABELS[token.type];
    return type;
}

function fixedLabel(token: ThemeToken): HTMLElement {
    const name = document.createElement("strong");
    name.className = "token-label-text";
    name.dataset.tokenLabelText = "true";
    name.textContent = token.label;
    return name;
}
