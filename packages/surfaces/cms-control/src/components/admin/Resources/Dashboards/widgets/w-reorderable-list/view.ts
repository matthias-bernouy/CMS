import { valueAt } from "../../runtime/expressions";
import { createItemControl } from "./controls";
import type { ReorderableListData, ReorderableListItem } from "./state";

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
    row.dataset.itemKey = String(valueAt(item, value.itemKey) ?? index);
    row.style.setProperty("--reorderable-columns", columns(value));

    const handle = document.createElement("span");
    handle.className = "handle";
    handle.title = "Drag to reorder";
    handle.setAttribute("aria-label", "Drag to reorder");
    handle.draggable = true;
    handle.textContent = "⠿";
    row.append(handle);

    for (const field of value.fields) {
        const fieldRoot = document.createElement("div");
        fieldRoot.className = "field";
        fieldRoot.append(createItemControl(item, index, field));
        row.append(fieldRoot);
    }

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

function columns(value: ReorderableListData): string {
    return ["24px", ...value.fields.map(() => "minmax(0, 1fr)"), "32px"].join(" ");
}

function query<T extends Element>(root: ShadowRoot, selector: string): T {
    return root.querySelector(selector) as T;
}
