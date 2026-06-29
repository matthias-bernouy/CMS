import {
    applySourceStatusConditions,
    CMS_SNIPPET_TAG,
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
    snippetItems: Array<Extract<BlockPickerItem, { kind: "snippet" }>>,
    slotName?: string,
    sourceStatusConditions?: CmsSourceStatusCondition[],
): ContentInsertion | null {
    if (!document) return null;
    if (item.kind === "media") return null;

    if (item.kind === "block") {
        const fragment = createBlockFragment(document, item.entry, snippetItems);
        const slotElements = slotElementChildren(fragment);
        for (const child of slotElements) {
            applySlot(child, slotName);
            applyCondition(child, sourceStatusConditions);
        }
        const selectionTarget = slotElements.find(child => child.tagName.toLowerCase() === item.entry.tag) ?? slotElements[0] ?? null;
        if (!selectionTarget) return null;
        return {
            fragment,
            selectionTarget,
            slotElements,
        };
    }

    if (item.kind === "snippet") {
        const snippet = document.createElement(CMS_SNIPPET_TAG);
        snippet.setAttribute("identifier", item.identifier);
        snippet.innerHTML = item.content;
        applySlot(snippet, slotName);
        applyCondition(snippet, sourceStatusConditions);
        const fragment = document.createDocumentFragment();
        fragment.append(snippet);
        return {
            fragment,
            selectionTarget: snippet,
            slotElements: [snippet],
        };
    }

    const template = document.createElement("template");
    template.innerHTML = item.content;
    const fragment = template.content.cloneNode(true) as DocumentFragment;
    expandSnippetReferences(fragment, snippetItems);
    const slotElements = slotElementChildren(fragment);
    for (const child of slotElements) {
        applySlot(child, slotName);
        applyCondition(child, sourceStatusConditions);
    }

    const selectionTarget = slotElements[0] ?? null;
    if (!selectionTarget) return null;

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

export function applyCondition(element: HTMLElement, sourceStatusConditions: CmsSourceStatusCondition[] | undefined): void {
    if (sourceStatusConditions?.length) applySourceStatusConditions(element, sourceStatusConditions);
}

export function snippetItems(items: BlockPickerItem[]): Array<Extract<BlockPickerItem, { kind: "snippet" }>> {
    return items.filter((item): item is Extract<BlockPickerItem, { kind: "snippet" }> => item.kind === "snippet");
}

function createBlockFragment(
    document: Document,
    entry: EditorCatalogEntry,
    snippets: Array<Extract<BlockPickerItem, { kind: "snippet" }>>,
): DocumentFragment {
    if (!entry.defaultContent) {
        const fragment = document.createDocumentFragment();
        fragment.append(document.createElement(entry.tag));
        return fragment;
    }

    const template = document.createElement("template");
    template.innerHTML = entry.defaultContent;
    const fragment = template.content.cloneNode(true) as DocumentFragment;
    expandSnippetReferences(fragment, snippets);
    return fragment;
}

function expandSnippetReferences(
    fragment: ParentNode,
    snippets: Array<Extract<BlockPickerItem, { kind: "snippet" }>>,
): void {
    if (snippets.length === 0) return;

    for (const element of Array.from(fragment.querySelectorAll(CMS_SNIPPET_TAG))) {
        const identifier = element.getAttribute("identifier");
        if (!identifier) continue;

        const snippet = snippets.find(item => item.identifier === identifier);
        if (!snippet) continue;

        element.innerHTML = snippet.content;
    }
}

function slotElementChildren(fragment: DocumentFragment): HTMLElement[] {
    return Array.from(fragment.children).filter(isElementNode) as HTMLElement[];
}

function isElementNode(node: Element): boolean {
    return node.nodeType === Node.ELEMENT_NODE;
}
