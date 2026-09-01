import { valueAt } from "../../runtime/expressions";
import { createItemControl } from "./controls";
import type { ReorderableListData, ReorderableListItem, ReorderableListItemField } from "./state";

export function renderList(root: ShadowRoot, value: ReorderableListData): void {
    query<HTMLElement>(root, ".reorderable-list").dataset.layout = value.layout ?? "rows";
    query<HTMLElement>(root, "[data-rows]").replaceChildren(
        ...value.items.map((item, index) => renderItem(value, item, index)),
    );
    renderHeader(root, value);
    const add = query<HTMLButtonElement>(root, "[data-add]");
    add.textContent = value.addLabel ?? "Add item";
    add.disabled = value.maxItems !== undefined && value.items.length >= value.maxItems;
}

export function draggedRow(event: DragEvent): HTMLElement | null {
    return (event.target as Element | null)?.closest<HTMLElement>(".row[data-index]") ?? null;
}

export function markDropTarget(root: ShadowRoot, target: HTMLElement): void {
    renderedRows(root).forEach((row) => row.toggleAttribute("data-drop-target", row === target));
}

export function clearDragState(root: ShadowRoot): void {
    renderedRows(root).forEach((row) => {
        row.removeAttribute("data-dragging");
        row.removeAttribute("data-drop-target");
    });
}

function renderHeader(root: ShadowRoot, value: ReorderableListData): void {
    const header = query<HTMLElement>(root, "[data-header]");
    header.hidden = value.layout === "cards";
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

function renderItem(value: ReorderableListData, item: ReorderableListItem, index: number): HTMLElement {
    return value.layout === "cards" ? renderCard(value, item, index) : renderRow(value, item, index);
}

function renderRow(value: ReorderableListData, item: ReorderableListItem, index: number): HTMLElement {
    const row = itemRoot(value, item, index);
    row.style.setProperty("--reorderable-columns", columns(value));
    row.append(dragHandle());
    for (const field of value.fields) {
        row.append(fieldRoot(item, index, field, false));
    }
    row.append(removeButton(value, index));
    return row;
}

function renderCard(value: ReorderableListData, item: ReorderableListItem, index: number): HTMLElement {
    const card = itemRoot(value, item, index);
    const toolbar = document.createElement("header");
    toolbar.className = "card-toolbar";
    const identity = document.createElement("code");
    identity.textContent = String(valueAt(item, value.itemKey) ?? `Item ${index + 1}`);
    toolbar.append(dragHandle(), identity, removeButton(value, index));
    card.append(toolbar);
    for (const field of value.fields.filter((candidate) => !candidate.secondary)) {
        card.append(fieldRoot(item, index, field, true));
    }
    const secondary = value.fields.filter((field) => field.secondary);
    if (secondary.length) {
        const details = document.createElement("details");
        details.className = "card-details";
        const summary = document.createElement("summary");
        summary.textContent = "Choice settings";
        details.append(summary, ...secondary.map((field) => fieldRoot(item, index, field, true)));
        card.append(details);
    }
    return card;
}

function itemRoot(value: ReorderableListData, item: ReorderableListItem, index: number): HTMLElement {
    const root = document.createElement("article");
    root.className = "row";
    root.dataset.index = String(index);
    root.dataset.itemKey = String(valueAt(item, value.itemKey) ?? index);
    return root;
}

function fieldRoot(
    item: ReorderableListItem,
    index: number,
    field: ReorderableListItemField,
    labelled: boolean,
): HTMLElement {
    const root = document.createElement("div");
    root.className = `field field-${field.type ?? "text"}`;
    if (labelled && field.type !== "media") {
        const label = document.createElement("span");
        label.className = "field-label";
        label.textContent = field.label;
        root.append(label);
    }
    root.append(createItemControl(item, index, field));
    return root;
}

function dragHandle(): HTMLElement {
    const handle = document.createElement("span");
    handle.className = "handle";
    handle.title = "Drag to reorder";
    handle.setAttribute("aria-label", "Drag to reorder");
    handle.draggable = true;
    handle.textContent = "⠿";
    return handle;
}

function removeButton(value: ReorderableListData, index: number): HTMLButtonElement {
    const remove = document.createElement("button");
    remove.className = "remove";
    remove.type = "button";
    remove.dataset.remove = String(index);
    remove.disabled = value.minItems !== undefined && value.items.length <= value.minItems;
    remove.setAttribute("aria-label", "Remove item");
    remove.title = "Remove item";
    remove.textContent = "×";
    return remove;
}

function columns(value: ReorderableListData): string {
    return ["24px", ...value.fields.map(() => "minmax(0, 1fr)"), "32px"].join(" ");
}

function query<T extends Element>(root: ShadowRoot, selector: string): T {
    return root.querySelector(selector) as T;
}

function renderedRows(root: ShadowRoot): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(".row"));
}
