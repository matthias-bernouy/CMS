import {
    itemKeyAt,
    itemTextAt,
    type ReorderableListData,
    type ReorderableListItem,
    type ReorderableListItemField,
} from "./state";

export function renderList(root: ShadowRoot, value: ReorderableListData): void {
    query<HTMLElement>(root, "[data-rows]")
        .replaceChildren(...value.items.map((item, index) => renderRow(value, item, index)));
    renderHeader(root, value);
    const add = query<HTMLButtonElement>(root, "[data-add]");
    add.textContent = value.addLabel ?? "Add item";
    add.disabled = value.maxItems !== undefined && value.items.length >= value.maxItems;
}

export function renderedRows(root: ShadowRoot): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(".row"));
}

function renderHeader(root: ShadowRoot, value: ReorderableListData): void {
    const header = query<HTMLElement>(root, "[data-header]");
    header.style.setProperty("--reorderable-columns", columns(value));
    const cells = [document.createElement("span")];
    for (const field of value.fields) {
        const cell = document.createElement("span");
        cell.textContent = field.label;
        cells.push(cell);
    }
    cells.push(document.createElement("span"));
    header.replaceChildren(...cells);
}

function renderRow(value: ReorderableListData, item: ReorderableListItem, index: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.index = String(index);
    row.dataset.itemKey = itemKeyAt(item, value.itemKey, index);
    row.style.setProperty("--reorderable-columns", columns(value));

    const handle = document.createElement("span");
    handle.className = "handle";
    handle.title = "Drag to reorder";
    handle.setAttribute("aria-label", "Drag to reorder");
    handle.draggable = true;
    handle.textContent = "⠿";
    row.append(handle);

    for (const field of value.fields) row.append(renderField(item, index, field));

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.type = "button";
    remove.dataset.remove = String(index);
    remove.disabled = value.minItems !== undefined && value.items.length <= value.minItems;
    remove.setAttribute("aria-label", "Remove item");
    remove.title = "Remove item";
    remove.textContent = "×";
    row.append(remove);
    return row;
}

function renderField(item: ReorderableListItem, index: number, field: ReorderableListItemField): HTMLElement {
    const root = document.createElement("div");
    root.className = "field";
    const input = document.createElement("input");
    input.type = "text";
    input.value = itemTextAt(item, field.path);
    input.dataset.itemIndex = String(index);
    input.dataset.itemPath = field.path;
    input.setAttribute("aria-label", field.label);
    if (field.required) input.required = true;
    if (field.placeholder) input.placeholder = field.placeholder;
    root.append(input);
    return root;
}

function columns(value: ReorderableListData): string {
    return ["24px", ...value.fields.map(() => "minmax(0, 1fr)"), "32px"].join(" ");
}

function query<T extends Element>(root: ShadowRoot, selector: string): T {
    return root.querySelector(selector) as T;
}
