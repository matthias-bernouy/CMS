import { createReferenceEditor } from "../w-detail/controls/editors";
import { valueAt } from "../../runtime/expressions";
import "../w-media-field/WMediaField";
import type { DashboardMediaItem } from "../w-media-field/types";
import type { ReorderableListItem, ReorderableListItemField } from "./state";

type ValueControl = HTMLElement & { value: unknown };

export function createItemControl(
    item: ReorderableListItem,
    index: number,
    field: ReorderableListItemField,
): HTMLElement {
    const input = fieldControl(field, field.type === "media" ? valueAt(item, field.path) : textAt(item, field.path));
    if (input instanceof HTMLInputElement && field.type === "checkbox") {
        input.checked = booleanAt(item, field.path);
    }
    input.dataset.itemIndex = String(index);
    input.dataset.itemField = field.id;
    input.dataset.itemPath = field.path;
    input.setAttribute("aria-label", field.label);
    if (field.required) {
        input.setAttribute("required", "");
    }
    if (field.placeholder) {
        input.setAttribute("placeholder", field.placeholder);
    }
    return input;
}

export function readItemControl(control: HTMLElement): string | boolean {
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
        return control.checked;
    }
    return "value" in control ? String((control as ValueControl).value ?? "") : "";
}

function fieldControl(field: ReorderableListItemField, value: unknown): HTMLElement {
    if (field.type === "secret-ref" || field.type === "page-link") {
        return createReferenceEditor({ ...field, type: field.type }, value);
    }
    if (field.type === "media") {
        const control = document.createElement("cms-dashboard-w-media-field") as HTMLElement & {
            items: DashboardMediaItem[];
        };
        const resolved = valueAtValue(value);
        control.setAttribute("label", field.label);
        control.setAttribute("layout", "card");
        control.setAttribute("accept", "image/*");
        control.items = resolved ? [resolved] : [];
        return control;
    }
    if (field.type === "select" || field.type === "combobox") {
        const control = document.createElement(field.type === "select" ? "p9r-select" : "p9r-combobox") as ValueControl;
        control.setAttribute("aria-label", field.label);
        const text = value === null || value === undefined ? "" : String(value);
        control.setAttribute("value", text);
        control.replaceChildren(
            ...(field.options ?? []).map((option) => {
                const element = document.createElement("option");
                element.value = option.value;
                element.textContent = option.label;
                element.selected = option.value === text;
                return element;
            }),
        );
        if (field.type === "combobox") {
            if (field.lookupKey) {
                control.dataset.lookupTarget = field.lookupKey;
            }
            control.toggleAttribute("remote-search", field.remoteSearch === true);
            control.toggleAttribute("remote-pagination", field.remotePagination === true);
            control.toggleAttribute("loading", field.lookupLoading === true);
            control.toggleAttribute("has-more", field.lookupHasMore === true);
        }
        control.value = text;
        return control;
    }
    if (field.type === "checkbox") {
        const input = document.createElement("input");
        input.type = "checkbox";
        return input;
    }
    const control = document.createElement("p9r-input") as ValueControl;
    const text = value === null || value === undefined ? "" : String(value);
    control.setAttribute("type", "text");
    control.setAttribute("value", text);
    control.value = text;
    return control;
}

function valueAtValue(value: unknown): DashboardMediaItem | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const item = value as Record<string, unknown>;
    return typeof item.id === "string" && typeof item.url === "string" ? (item as unknown as DashboardMediaItem) : null;
}

function textAt(value: unknown, path: string): string {
    const resolved = valueAt(value, path);
    return resolved === null || resolved === undefined ? "" : String(resolved);
}

function booleanAt(value: unknown, path: string): boolean {
    const resolved = valueAt(value, path);
    return resolved === true || resolved === "true" || resolved === 1;
}
