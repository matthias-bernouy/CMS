import type { IntegrationAnswerValue, IntegrationObjectListField, IntegrationObjectListInput } from "../model";
import type { IntegrationPageLink } from "../api";
import { configurePageLinkSelect, configureSelect } from "./selects";

export function objectListControl(
    input: IntegrationObjectListInput,
    answer: unknown,
    loadPageLinks?: () => Promise<IntegrationPageLink[]>,
): HTMLElement {
    const root = document.createElement("div");
    root.className = "object-list";
    root.dataset.objectListName = input.name;
    const items = document.createElement("div");
    items.className = "object-list-items";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "object-list-add";
    add.textContent = input.addLabel ?? "Add item";
    add.addEventListener("click", () => {
        items.append(objectListItem(input, {}, loadPageLinks));
        refreshList(input, root);
    });
    root.append(items, add);

    const values = Array.isArray(answer) ? answer : [];
    const initialCount = values.length || input.minItems || (input.required ? 1 : 0);
    for (let index = 0; index < initialCount; index++) {
        items.append(objectListItem(input, record(values[index]), loadPageLinks));
    }
    refreshList(input, root);
    return root;
}

export function collectObjectListAnswer(
    root: HTMLElement,
    input: IntegrationObjectListInput,
): IntegrationAnswerValue[] | undefined {
    const list = root.querySelector<HTMLElement>(`[data-object-list-name="${cssEscape(input.name)}"]`);
    if (!list) {
        return undefined;
    }
    return Array.from(list.querySelectorAll<HTMLElement>("[data-object-list-item]")).map((item) => {
        const value: Record<string, IntegrationAnswerValue> = {};
        for (const field of input.fields) {
            const control = item.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
                `[data-object-field="${cssEscape(field.name)}"]`,
            )!;
            value[field.name] =
                field.type === "boolean"
                    ? (control as HTMLInputElement).checked
                    : field.type === "select" && field.multiple
                      ? Array.from((control as HTMLSelectElement).selectedOptions, (option) => option.value)
                      : control.value;
        }
        return value;
    });
}

function objectListItem(
    input: IntegrationObjectListInput,
    value: Record<string, unknown>,
    loadPageLinks?: () => Promise<IntegrationPageLink[]>,
): HTMLElement {
    const item = document.createElement("article");
    item.className = "object-list-item";
    item.dataset.objectListItem = "";
    const header = document.createElement("div");
    header.className = "object-list-item-header";
    const title = document.createElement("strong");
    title.dataset.objectListItemTitle = "";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "object-list-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
        const root = item.closest<HTMLElement>("[data-object-list-name]")!;
        item.remove();
        refreshList(input, root);
    });
    header.append(title, remove);
    const fields = document.createElement("div");
    fields.className = "object-list-item-fields";
    for (const field of input.fields) {
        fields.append(fieldControl(field, value[field.name], loadPageLinks));
    }
    item.append(header, fields);
    return item;
}

function fieldControl(
    field: IntegrationObjectListField,
    value: unknown,
    loadPageLinks?: () => Promise<IntegrationPageLink[]>,
): HTMLElement {
    const label = document.createElement("label");
    label.className = "object-list-item-field";
    const caption = document.createElement("span");
    caption.textContent = field.label;
    const control =
        field.type === "textarea"
            ? document.createElement("textarea")
            : field.type === "select" || field.type === "page-link"
              ? document.createElement("select")
              : document.createElement("input");
    control.dataset.objectField = field.name;
    control.required = field.required === true;
    if (field.type === "boolean") {
        (control as HTMLInputElement).type = "checkbox";
        (control as HTMLInputElement).checked = value === true;
    } else if (field.type === "textarea") {
        (control as HTMLTextAreaElement).rows = 3;
        control.value = typeof value === "string" ? value : "";
    } else if (field.type === "select") {
        configureSelect(control as HTMLSelectElement, field.options, value, field.multiple === true);
    } else if (field.type === "page-link") {
        configurePageLinkSelect(control as HTMLSelectElement, value, loadPageLinks?.());
    } else {
        (control as HTMLInputElement).type = "text";
        control.value = typeof value === "string" ? value : "";
    }
    label.append(caption, control);
    return label;
}

function refreshList(input: IntegrationObjectListInput, root: HTMLElement): void {
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-object-list-item]"));
    items.forEach((item, index) => {
        item.querySelector<HTMLElement>("[data-object-list-item-title]")!.textContent = `Item ${index + 1}`;
        item.querySelector<HTMLButtonElement>(".object-list-remove")!.disabled = items.length <= (input.minItems ?? 0);
    });
    const add = root.querySelector<HTMLButtonElement>(".object-list-add")!;
    add.disabled = input.maxItems !== undefined && items.length >= input.maxItems;
}

function record(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function cssEscape(value: string): string {
    return typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(value)
        : value.replaceAll('"', '\\"');
}
