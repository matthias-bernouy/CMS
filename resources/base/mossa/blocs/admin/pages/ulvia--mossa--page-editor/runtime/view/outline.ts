import type { EditablePageDocument } from "../document/index";
import { displayLabel, type EditorCatalogueItem } from "../model";

export function renderOutline(
    target: HTMLOListElement,
    documentModel: EditablePageDocument,
    catalogue: EditorCatalogueItem[],
    selected: HTMLElement | null,
): void {
    target.replaceChildren();
    appendOutlineLevel(target, null, documentModel, catalogue, selected);
}

export function itemForElement(
    element: HTMLElement,
    catalogue: EditorCatalogueItem[],
): EditorCatalogueItem | undefined {
    return catalogue.find((item) => element.getAttribute("cms-bloc") === item.id);
}

function appendOutlineLevel(
    target: HTMLOListElement,
    parent: HTMLElement | null,
    documentModel: EditablePageDocument,
    catalogue: EditorCatalogueItem[],
    selected: HTMLElement | null,
): void {
    for (const element of documentModel.children(parent)) {
        const item = itemForElement(element, catalogue);
        const row = document.createElement("li");
        row.dataset.treeItem = "";
        row.append(selectionButton(element, item, documentModel, selected));
        const children = documentModel.children(element);
        const slots = documentModel.insertionSlots(element, catalogue);
        if (children.length > 0 || slots.length > 0) {
            const nested = document.createElement("ol");
            appendOutlineLevel(nested, element, documentModel, catalogue, selected);
            nested.append(...slots.map((slot) => slotButton(element, slot, documentModel)));
            row.append(nested);
        }
        target.append(row);
    }
}

function selectionButton(
    element: HTMLElement,
    item: EditorCatalogueItem | undefined,
    documentModel: EditablePageDocument,
    selected: HTMLElement | null,
): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.select = documentModel.addressOf(element)?.join(".") ?? "";
    button.setAttribute("aria-current", String(element === selected));
    const name = document.createElement("span");
    name.textContent = item?.name ?? displayLabel(element.getAttribute("cms-bloc") ?? element.localName);
    button.append(name);
    const slot = element.getAttribute("slot");
    if (slot) {
        const slotLabel = document.createElement("small");
        slotLabel.textContent = displayLabel(slot);
        button.append(slotLabel);
    }
    return button;
}

function slotButton(element: HTMLElement, slot: string, documentModel: EditablePageDocument): HTMLLIElement {
    const row = document.createElement("li");
    row.dataset.slotTarget = slot;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.addParent = documentModel.addressOf(element)?.join(".") ?? "";
    button.dataset.addSlot = slot;
    button.textContent = `+ ${displayLabel(slot || "content")}`;
    row.append(button);
    return row;
}
