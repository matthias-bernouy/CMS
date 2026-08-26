export const COMPOSITION_RUNTIME_ATTRIBUTE = "data-p9r-composition";
export const COMPOSITION_INPUT_ATTRIBUTE = "data-p9r-composition-input";
export const COMPOSITION_OUTPUT_ATTRIBUTE = "data-p9r-composition-output";
export const COMPOSITION_AUTHORED_ATTRIBUTE = "data-p9r-composition-authored";

const SLOT_START = "p9r-composition-slot-start:";
const SLOT_END = "p9r-composition-slot-end:";

export function clearCompositionRuntimeState(root: ParentNode): void {
    while (true) {
        const compositions = compositionElements(root);
        if (compositions.length === 0) {
            return;
        }

        for (const composition of compositions.reverse()) {
            const input = compositionInput(composition);
            const output = Array.from(composition.children).find((element) =>
                element.hasAttribute(COMPOSITION_OUTPUT_ATTRIBUTE),
            );
            const authored = output ? authoredOutputNodes(output) : [];
            const appended = Array.from(composition.childNodes)
                .filter(
                    (node) =>
                        node !== input &&
                        node !== output &&
                        (node.nodeType === 1 || (node.nodeType === 3 && Boolean(node.nodeValue?.trim()))),
                )
                .map((node) => node.cloneNode(true));
            composition.removeAttribute(COMPOSITION_RUNTIME_ATTRIBUTE);
            if (authored.length > 0 || appended.length > 0) {
                composition.replaceChildren(...authored, ...appended);
            } else if (input) {
                composition.replaceChildren(input.content.cloneNode(true));
            } else {
                composition.replaceChildren();
            }
        }
    }
}

function authoredOutputNodes(output: Element): Node[] {
    const recovered: Node[] = [];
    visit(output, (comment) => {
        const value = comment.data;
        if (!value.startsWith(SLOT_START)) {
            return;
        }
        const encodedName = value.slice(SLOT_START.length);
        const endValue = `${SLOT_END}${encodedName}`;
        const slotName = decodeURIComponent(encodedName);
        for (let node = comment.nextSibling; node && !(node.nodeType === 8 && node.nodeValue === endValue); ) {
            const next = node.nextSibling;
            const clone = node.cloneNode(true);
            cleanAuthoredClone(clone, slotName);
            recovered.push(clone);
            node = next;
        }
    });
    return recovered;
}

function visit(root: Node, callback: (comment: Comment) => void): void {
    for (const child of Array.from(root.childNodes)) {
        if (child.nodeType === 8) {
            callback(child as Comment);
        }
        visit(child, callback);
    }
}

function cleanAuthoredClone(node: Node, slotName: string): void {
    if (node.nodeType !== 1) {
        return;
    }
    const element = node as Element;
    element.removeAttribute(COMPOSITION_AUTHORED_ATTRIBUTE);
    if (slotName) {
        element.setAttribute("slot", slotName);
    } else {
        element.removeAttribute("slot");
    }
    for (const descendant of Array.from(element.querySelectorAll(`[${COMPOSITION_AUTHORED_ATTRIBUTE}]`))) {
        descendant.removeAttribute(COMPOSITION_AUTHORED_ATTRIBUTE);
    }
}

export function compositionInput(host: Element): HTMLTemplateElement | null {
    const input = Array.from(host.children).find(
        (element) => element.localName === "template" && element.hasAttribute(COMPOSITION_INPUT_ATTRIBUTE),
    );
    return (input as HTMLTemplateElement | undefined) ?? null;
}

export function isCompositionRuntimeElement(element: Element): boolean {
    return element.hasAttribute(COMPOSITION_RUNTIME_ATTRIBUTE) && compositionInput(element) !== null;
}

function compositionElements(root: ParentNode): HTMLElement[] {
    const selector = `[${COMPOSITION_RUNTIME_ATTRIBUTE}]`;
    const elements = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(isCompositionRuntimeElement);
    if (root.nodeType === Node.ELEMENT_NODE && isCompositionRuntimeElement(root as Element)) {
        elements.unshift(root as HTMLElement);
    }
    return elements;
}
