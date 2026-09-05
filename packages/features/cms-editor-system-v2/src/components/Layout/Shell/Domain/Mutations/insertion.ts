import {
    applySourceStatusConditions,
    nativeDomTreeIssue,
    type CmsSourceStatusCondition,
    type EditorCatalogEntry,
} from "@bernouy/cms-content/editor";
import { prepareNetworkInertBindings } from "@bernouy/components/binding-dom";

import type { BlockPickerItem } from "../../../Pickers/BlockPickerModal/BlockPickerModal";

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

    const fragment = createBlockFragment(document, item.entry);
    const slotElements = slotElementChildren(fragment);
    for (const child of slotElements) {
        applySlot(child, slotName);
        applyCondition(child, sourceStatusConditions);
    }
    if (
        nativeDomTreeIssue(fragment, {
            allowIncompleteMedia: true,
            skipRootPlacement: true,
            requireFormSource: false,
        })
    ) {
        return null;
    }
    prepareNetworkInertBindings(fragment);

    const selectionTarget =
        slotElements.find((child) => child.tagName.toLowerCase() === item.entry.tag.toLowerCase()) ?? null;
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
