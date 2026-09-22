export const COMPOSITION_RUNTIME_ATTRIBUTE = "data-p9r-composition";
export const COMPOSITION_INPUT_ATTRIBUTE = "data-p9r-composition-input";
export const COMPOSITION_OUTPUT_ATTRIBUTE = "data-p9r-composition-output";
export const COMPOSITION_CONTROLLER_ATTRIBUTE = "data-p9r-composition-controller";
export const COMPOSITION_AUTHORED_ATTRIBUTE = "data-p9r-composition-authored";
export const COMPOSITION_CONTROLLER_RUNTIME_ATTRIBUTE = "data-p9r-composition-controller-runtime";

const SLOT_START = "p9r-composition-slot-start:";
const SLOT_END = "p9r-composition-slot-end:";

export type CompositionDefinition = { id: string; compositionHTML?: string };
export type CompositionExpansionMode = "delivery" | "editor";

/**
 * Expands registered composition templates into real light DOM.
 *
 * Delivery replaces the authoring host entirely. Editor mode retains the
 * authored children in an inert template and exposes generated output beside
 * it, so the existing serializer can persist only the source representation.
 */
export function expandCompositions(
    root: ParentNode,
    definitions: readonly CompositionDefinition[],
    mode: CompositionExpansionMode = "delivery",
): void {
    const templates = new Map(
        definitions.flatMap((definition) =>
            definition.compositionHTML ? [[definition.id.toLowerCase(), definition.compositionHTML] as const] : [],
        ),
    );
    if (templates.size === 0) {
        return;
    }

    const expansionLimit = templates.size * 100 + 1_000;
    for (let count = 0; count < expansionLimit; count++) {
        const host = nextComposition(root, templates);
        if (!host) {
            return;
        }
        expandHost(host, templates.get(host.localName)!, mode);
    }
    throw new Error("Composition expansion exceeded its safety limit; check for a recursive composition dependency");
}

function nextComposition(root: ParentNode, templates: ReadonlyMap<string, string>): Element | null {
    for (const element of Array.from(root.querySelectorAll("*"))) {
        if (templates.has(element.localName) && !element.hasAttribute(COMPOSITION_RUNTIME_ATTRIBUTE)) {
            return element;
        }
    }
    return null;
}

function expandHost(host: Element, source: string, mode: CompositionExpansionMode): void {
    const document = host.ownerDocument;
    const authored = Array.from(host.childNodes);
    const input = mode === "editor" ? document.createElement("template") : null;
    if (input) {
        input.setAttribute(COMPOSITION_INPUT_ATTRIBUTE, "");
        input.content.append(...authored.map((node) => node.cloneNode(true)));
    }
    const template = document.createElement("template");
    template.innerHTML = source;
    projectSlots(template.content, authored, mode);
    const controller = copyHostAttributes(host, template.content);

    if (mode === "delivery") {
        propagateHostSlot(host, template.content);
        host.replaceWith(...Array.from(template.content.childNodes));
        return;
    }

    const output = document.createElement("p9r-composition-output");
    output.setAttribute(COMPOSITION_OUTPUT_ATTRIBUTE, "");
    controller?.setAttribute(COMPOSITION_CONTROLLER_RUNTIME_ATTRIBUTE, "");
    output.append(...Array.from(template.content.childNodes));
    host.replaceChildren(input!, output);
    host.setAttribute(COMPOSITION_RUNTIME_ATTRIBUTE, "");
}

function projectSlots(fragment: DocumentFragment, authored: Node[], mode: CompositionExpansionMode): void {
    const usedNames = new Set<string>();
    for (const slot of Array.from(fragment.querySelectorAll("slot"))) {
        const name = slot.getAttribute("name") ?? "";
        const assigned = usedNames.has(name) ? [] : assignedNodes(authored, name);
        usedNames.add(name);
        const projected =
            assigned.length > 0
                ? assigned.map((node) => (mode === "editor" ? node : node.cloneNode(true)))
                : Array.from(slot.childNodes);
        remapProjectedSlot(projected, slot.getAttribute("slot"));
        if (mode === "editor" && assigned.length > 0) {
            markAuthored(projected, name);
            const encodedName = encodeURIComponent(name);
            slot.replaceWith(
                slot.ownerDocument.createComment(`${SLOT_START}${encodedName}`),
                ...projected,
                slot.ownerDocument.createComment(`${SLOT_END}${encodedName}`),
            );
        } else {
            slot.replaceWith(...projected);
        }
    }
}

function markAuthored(nodes: Node[], slotName: string): void {
    for (const node of nodes) {
        if (node.nodeType === 1) {
            (node as Element).setAttribute(COMPOSITION_AUTHORED_ATTRIBUTE, slotName);
        }
    }
}

function assignedNodes(nodes: Node[], name: string): Node[] {
    return nodes.filter((node) => {
        if (node.nodeType !== 1) {
            return name === "";
        }
        const slot = (node as Element).getAttribute("slot") ?? "";
        return slot === name;
    });
}

function remapProjectedSlot(nodes: Node[], forwardedSlot: string | null): void {
    for (const node of nodes) {
        if (node.nodeType !== 1) {
            continue;
        }
        const element = node as Element;
        if (forwardedSlot === null) {
            element.removeAttribute("slot");
        } else {
            element.setAttribute("slot", forwardedSlot);
        }
    }
}

function copyHostAttributes(host: Element, fragment: DocumentFragment): Element | null {
    const controller = fragment.querySelector(`[${COMPOSITION_CONTROLLER_ATTRIBUTE}]`);
    if (!controller) {
        return null;
    }
    controller.removeAttribute(COMPOSITION_CONTROLLER_ATTRIBUTE);
    for (const attribute of Array.from(host.attributes)) {
        if (attribute.name !== "slot" && !attribute.name.startsWith("data-p9r-composition")) {
            controller.setAttribute(attribute.name, attribute.value);
        }
    }
    return controller;
}

function propagateHostSlot(host: Element, fragment: DocumentFragment): void {
    const slot = host.getAttribute("slot");
    if (slot === null) {
        return;
    }
    for (const node of Array.from(fragment.childNodes)) {
        if (node.nodeType === 1) {
            (node as Element).setAttribute("slot", slot);
        }
    }
}
