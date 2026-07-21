import {
    applySourceStatusConditions,
    type CmsSourceStatusCondition,
    type EditorCatalogEntry,
} from "@bernouy/cms-content/editor";

import type { BlockPickerItem } from "../../../BlockPickerModal/BlockPickerModal";

export type ContentInsertion = {
    fragment: DocumentFragment;
    selectionTarget: HTMLElement;
    slotElements: HTMLElement[];
};

export function createInsertion(
    document: Document | null,
    item: BlockPickerItem,
    slotName?: string,
    sourceStatusConditions?: CmsSourceStatusCondition[],
): ContentInsertion | null {
    if (!document) {
        return null;
    }
    if (item.kind === "media") {
        return null;
    }

    if (item.kind === "block") {
        const fragment = createBlockFragment(document, item.entry);
        const slotElements = slotElementChildren(fragment);
        for (const child of slotElements) {
            applySlot(child, slotName);
            applyCondition(child, sourceStatusConditions);
        }
        const selectionTarget =
            slotElements.find((child) => child.tagName.toLowerCase() === item.entry.tag) ?? slotElements[0] ?? null;
        if (!selectionTarget) {
            return null;
        }
        return {
            fragment,
            selectionTarget,
            slotElements,
        };
    }

    const template = document.createElement("template");
    template.innerHTML = item.content;
    const fragment = template.content.cloneNode(true) as DocumentFragment;
    const slotElements = slotElementChildren(fragment);
    for (const child of slotElements) {
        applySlot(child, slotName);
        applyCondition(child, sourceStatusConditions);
    }

    const selectionTarget = slotElements[0] ?? null;
    if (!selectionTarget) {
        return null;
    }

    return {
        fragment,
        selectionTarget,
        slotElements,
    };
}

export function applySlot(element: HTMLElement, slotName: string | undefined): void {
    if (slotName) {
        element.setAttribute("slot", slotName);
    } else {
        element.removeAttribute("slot");
    }
}

export function applyCondition(
    element: HTMLElement,
    sourceStatusConditions: CmsSourceStatusCondition[] | undefined,
): void {
    if (sourceStatusConditions?.length) {
        applySourceStatusConditions(element, sourceStatusConditions);
    }
}

function createBlockFragment(document: Document, entry: EditorCatalogEntry): DocumentFragment {
    if (!entry.defaultContent) {
        const fragment = document.createDocumentFragment();
        fragment.append(document.createElement(entry.tag));
        return fragment;
    }

    const template = document.createElement("template");
    template.innerHTML = entry.defaultContent;
    return template.content.cloneNode(true) as DocumentFragment;
}

function slotElementChildren(fragment: DocumentFragment): HTMLElement[] {
    return Array.from(fragment.children).filter(isElementNode) as HTMLElement[];
}

function isElementNode(node: Element): boolean {
    return node.nodeType === Node.ELEMENT_NODE;
}
