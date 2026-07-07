import type { SetupResourceRow } from "../../model";
import { cloneElement, fillIcon, text } from "../templates";
import { iconForResourceType } from "./icons";

export function appendBadges(root: HTMLElement, labels: string[]): void {
    root.replaceChildren();
    const visible = labels.slice(0, 4);
    const remaining = labels.length - visible.length;
    for (const label of visible) root.append(badge(label));
    if (remaining > 0) {
        const more = badge(`+${remaining} others`);
        more.classList.add("badge-muted");
        root.append(more);
    }
}

export function renderResourceRows(root: HTMLElement, rows: SetupResourceRow[]): void {
    root.replaceChildren();
    if (!rows.length) {
        root.append(empty("No resources declared by this integration."));
        return;
    }
    for (const row of rows) {
        const element = cloneElement("resource-row");
        fillIcon(element, "[data-icon-host]", iconForResourceType(row.type));
        text(element, "[data-label]", row.label);
        text(element, "[data-detail]", row.detail);
        text(element, "[data-type]", row.type);
        root.append(element);
    }
}

export function renderSummary(root: HTMLElement, rows: Array<{ label: string; value: unknown }>): void {
    const grid = cloneElement("summary-grid");
    for (const row of rows) {
        const element = cloneElement("summary-row");
        text(element, "[data-label]", row.label);
        text(element, "[data-value]", row.value);
        grid.append(element);
    }
    root.replaceChildren(grid);
}

export function renderPlaceholder(root: HTMLElement, title: string, copy: string): void {
    const element = cloneElement("placeholder");
    text(element, "[data-title]", title);
    text(element, "[data-copy]", copy);
    root.replaceChildren(element);
}

export function empty(message: string): HTMLElement {
    const element = document.createElement("p");
    element.className = "empty";
    element.textContent = message;
    return element;
}

function badge(label: string): HTMLElement {
    const element = cloneElement("badge");
    element.textContent = label;
    return element;
}
