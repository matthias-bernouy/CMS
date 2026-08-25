export function wrapRangeContents(range: Range, tagName: string, attributes: Record<string, string> = {}): Range {
    const document = range.startContainer.ownerDocument!;
    const wrapper = document.createElement(tagName);
    for (const [name, value] of Object.entries(attributes)) {
        wrapper.setAttribute(name, value);
    }
    wrapper.append(range.extractContents());
    range.insertNode(wrapper);

    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    return nextRange;
}

export function findRangeWrapper(
    editor: HTMLElement,
    range: Range,
    tagName: string,
    predicate: (element: HTMLElement) => boolean,
): HTMLElement | null {
    const start = closestWrapper(editor, range.startContainer, tagName, predicate);
    if (!start) {
        return null;
    }

    const end = closestWrapper(editor, range.endContainer, tagName, predicate);
    return start === end ? start : null;
}

export function unwrapElement(editor: HTMLElement, element: HTMLElement): Range {
    const document = editor.ownerDocument;
    const fragment = document.createDocumentFragment();
    const firstChild = element.firstChild;
    const lastChild = element.lastChild;

    while (element.firstChild) {
        fragment.append(element.firstChild);
    }

    element.replaceWith(fragment);

    const nextRange = document.createRange();
    if (firstChild && lastChild) {
        nextRange.setStartBefore(firstChild);
        nextRange.setEndAfter(lastChild);
    } else {
        nextRange.selectNodeContents(editor);
        nextRange.collapse(false);
    }
    return nextRange;
}

function closestWrapper(
    editor: HTMLElement,
    node: Node,
    tagName: string,
    predicate: (element: HTMLElement) => boolean,
): HTMLElement | null {
    const normalizedTag = tagName.toUpperCase();
    let current: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;

    while (current && current !== editor) {
        if (current.nodeType === Node.ELEMENT_NODE) {
            const element = current as HTMLElement;
            if (element.tagName === normalizedTag && predicate(element)) {
                return element;
            }
        }
        current = current.parentNode;
    }

    return null;
}
