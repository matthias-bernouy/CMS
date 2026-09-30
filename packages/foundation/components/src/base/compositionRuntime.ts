export const COMPOSITION_RUNTIME_ATTRIBUTE = "data-p9r-composition";
export const COMPOSITION_INPUT_ATTRIBUTE = "data-p9r-composition-input";
export const COMPOSITION_OUTPUT_ATTRIBUTE = "data-p9r-composition-output";
export const COMPOSITION_AUTHORED_ATTRIBUTE = "data-p9r-composition-authored";
export const COMPONENT_COMPOSITION_ATTRIBUTE = "data-p9r-component-composition";

const SLOT_START = "p9r-composition-slot-start:";
const SLOT_END = "p9r-composition-slot-end:";
const FALLBACK_START = "p9r-composition-slot-fallback-start:";
const FALLBACK_END = "p9r-composition-slot-fallback-end:";
const COMPONENT_OUTPUT_START = "p9r-component-output-start";
const COMPONENT_OUTPUT_END = "p9r-component-output-end";

export function clearCompositionRuntimeState(root: ParentNode): void {
    while (true) {
        const compositions = compositionElements(root);
        if (compositions.length === 0) {
            return;
        }

        for (const composition of compositions.reverse()) {
            const input = compositionInput(composition);
            if (composition.hasAttribute(COMPONENT_COMPOSITION_ATTRIBUTE)) {
                const authored = authoredOutputNodes(composition);
                const appended = componentAppendedNodes(composition, input);
                restoreComponentAttributes(composition, input);
                composition.removeAttribute(COMPOSITION_RUNTIME_ATTRIBUTE);
                composition.removeAttribute(COMPONENT_COMPOSITION_ATTRIBUTE);
                composition.replaceChildren(
                    ...(authored.length > 0 || appended.length > 0
                        ? [...authored, ...appended]
                        : input
                          ? [input.content.cloneNode(true)]
                          : []),
                );
                continue;
            }
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

function restoreComponentAttributes(composition: Element, input: HTMLTemplateElement | null): void {
    const original = input?.getAttribute("data-p9r-composition-host-attributes");
    if (!original) {
        return;
    }
    const attributes = JSON.parse(original) as [string, string][];
    for (const attribute of Array.from(composition.attributes)) {
        composition.removeAttribute(attribute.name);
    }
    for (const [name, value] of attributes) {
        composition.setAttribute(name, value);
    }
}

function componentAppendedNodes(composition: Element, input: HTMLTemplateElement | null): Node[] {
    const nodes: Node[] = [];
    let insideOutput = false;
    for (const node of Array.from(composition.childNodes)) {
        if (node.nodeType === 8 && node.nodeValue === COMPONENT_OUTPUT_START) {
            insideOutput = true;
            continue;
        }
        if (node.nodeType === 8 && node.nodeValue === COMPONENT_OUTPUT_END) {
            insideOutput = false;
            continue;
        }
        if (
            !insideOutput &&
            node !== input &&
            (node.nodeType === 1 || (node.nodeType === 3 && node.nodeValue?.trim()))
        ) {
            nodes.push(node.cloneNode(true));
        }
    }
    return nodes;
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

/** Add page-owned nodes at their visible substitution point in an editor composition. */
export function insertCompositionSlotNodes(host: Element, name: string, nodes: Node[]): boolean {
    const input = compositionInput(host);
    if (!input || !isCompositionRuntimeElement(host)) {
        return false;
    }
    const forwarding = JSON.parse(input.getAttribute("data-p9r-composition-slot-forwarding") ?? "{}") as Record<
        string,
        string | null
    >;
    if (!Object.hasOwn(forwarding, name)) {
        return false;
    }
    const encoded = encodeURIComponent(name);
    const end = findCompositionComment(host, `${SLOT_END}${encoded}`);
    if (!end?.parentNode) {
        return false;
    }
    const forwardedSlot = forwarding[name];
    for (const node of nodes) {
        if (node.nodeType !== 1) {
            continue;
        }
        const element = node as Element;
        element.setAttribute(COMPOSITION_AUTHORED_ATTRIBUTE, name);
        if (forwardedSlot === null || forwardedSlot === undefined) {
            element.removeAttribute("slot");
        } else {
            element.setAttribute("slot", forwardedSlot);
        }
    }
    removeCompositionFallback(end, encoded);
    for (const node of nodes) {
        end.parentNode.insertBefore(node, end);
    }
    return true;
}

function findCompositionComment(host: Element, value: string): Comment | null {
    const pending = [...host.childNodes];
    while (pending.length > 0) {
        const node = pending.shift()!;
        if (node.nodeType === 8 && node.nodeValue === value) {
            return node as Comment;
        }
        if (node.nodeType === 1 && isCompositionRuntimeElement(node as Element)) {
            continue;
        }
        pending.unshift(...node.childNodes);
    }
    return null;
}

function removeCompositionFallback(end: Comment, encoded: string): void {
    const start = end.nextSibling;
    if (start?.nodeType !== 8 || start.nodeValue !== `${FALLBACK_START}${encoded}`) {
        return;
    }
    for (let node: ChildNode | null = start; node; ) {
        const next: ChildNode | null = node.nextSibling;
        const last = node.nodeType === 8 && node.nodeValue === `${FALLBACK_END}${encoded}`;
        node.parentNode?.removeChild(node);
        if (last) {
            return;
        }
        node = next;
    }
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
