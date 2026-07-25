export const BOUND_IMAGE_SELECTOR = [
    "picture[data-cms-network-inert]",
    "img[data-cms-network-inert]",
    "source[data-cms-network-inert]",
    "img[data-cms-src]",
    "img[data-src]",
    "img[data-cms-srcset]",
    "img[data-cms-sizes]",
    "source[data-cms-srcset]",
    "source[data-cms-sizes]",
    "source[data-cms-media]",
].join(",");

export function rootContains(root: Document | Element, element: Element): boolean {
    return root === element || root.contains(element);
}

export function isImage(node: Node): node is HTMLImageElement {
    return node.nodeType === 1 && (node as Element).localName === "img";
}

export function boundImageGroup(element: Element): Element {
    return element.closest("picture") ?? element;
}

export function boundElements(group: Element): Element[] {
    const elements: Element[] = [];
    if (group.matches(BOUND_IMAGE_SELECTOR)) {
        elements.push(group);
    }
    elements.push(...Array.from(group.querySelectorAll(BOUND_IMAGE_SELECTOR)));
    return elements;
}

export function forEachBoundElement(node: Node, visit: (element: Element) => void): void {
    if (node.nodeType === 1 && (node as Element).matches(BOUND_IMAGE_SELECTOR)) {
        visit(node as Element);
    }
    if ("querySelectorAll" in node) {
        for (const element of Array.from((node as ParentNode).querySelectorAll(BOUND_IMAGE_SELECTOR))) {
            visit(element);
        }
    }
}
