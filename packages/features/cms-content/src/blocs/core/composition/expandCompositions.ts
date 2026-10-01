export const COMPOSITION_RUNTIME_ATTRIBUTE = "data-cms-composition";
export const COMPOSITION_INPUT_ATTRIBUTE = "data-cms-composition-input";
export const COMPOSITION_OUTPUT_ATTRIBUTE = "data-cms-composition-output";
export const COMPOSITION_CONTROLLER_ATTRIBUTE = "data-cms-composition-controller";
export const COMPOSITION_AUTHORED_ATTRIBUTE = "data-cms-composition-authored";
export const COMPOSITION_CONTROLLER_RUNTIME_ATTRIBUTE = "data-cms-composition-controller-runtime";
export const COMPONENT_COMPOSITION_ATTRIBUTE = "data-cms-component-composition";

const SLOT_START = "cms-composition-slot-start:";
const SLOT_END = "cms-composition-slot-end:";
const FALLBACK_START = "cms-composition-slot-fallback-start:";
const FALLBACK_END = "cms-composition-slot-fallback-end:";
const COMPONENT_OUTPUT_START = "cms-component-output-start";
const COMPONENT_OUTPUT_END = "cms-component-output-end";

export type CompositionDefinition = { id: string; compositionHTML?: string; componentHTML?: string };
export type CompositionExpansionMode = "delivery" | "preview";
type Template = { html: string; retainHost: boolean };

/**
 * Expands registered composition templates into real light DOM.
 *
 * Pure compositions replace their host in Delivery. Component compositions
 * keep it so their fixed children can project through its shadow slots.
 * Preview mode retains page-owned children separately from generated markup.
 */
export function expandCompositions(
    root: ParentNode,
    definitions: readonly CompositionDefinition[],
    mode: CompositionExpansionMode = "delivery",
): void {
    const templates = new Map<string, Template>(
        definitions.flatMap((definition) => {
            const html = definition.compositionHTML ?? definition.componentHTML;
            return html ? [[definition.id.toLowerCase(), { html, retainHost: !!definition.componentHTML }]] : [];
        }),
    );
    if (templates.size === 0) {
        return;
    }

    const expanded = new WeakSet<Element>();
    const expansionLimit = templates.size * 100 + 1_000;
    for (let count = 0; count < expansionLimit; count++) {
        const host = nextComposition(root, templates, expanded);
        if (!host) {
            return;
        }
        expanded.add(host);
        expandHost(host, templates.get(host.localName)!, mode);
    }
    throw new Error("Composition expansion exceeded its safety limit; check for a recursive composition dependency");
}

function nextComposition(
    root: ParentNode,
    templates: ReadonlyMap<string, Template>,
    expanded: WeakSet<Element>,
): Element | null {
    for (const element of Array.from(root.querySelectorAll("*"))) {
        if (
            templates.has(element.localName) &&
            !expanded.has(element) &&
            !element.hasAttribute(COMPOSITION_RUNTIME_ATTRIBUTE)
        ) {
            return element;
        }
    }
    return null;
}

function expandHost(host: Element, definition: Template, mode: CompositionExpansionMode): void {
    const document = host.ownerDocument;
    const authored = Array.from(host.childNodes);
    const input = mode === "preview" ? document.createElement("template") : null;
    if (input) {
        input.setAttribute(COMPOSITION_INPUT_ATTRIBUTE, "");
        input.content.append(...authored.map((node) => node.cloneNode(true)));
    }
    const template = document.createElement("template");
    template.innerHTML = definition.html;
    const forwarding = projectSlots(template.content, authored, mode);
    if (input) {
        input.setAttribute("data-cms-composition-slot-forwarding", JSON.stringify(forwarding));
    }
    const controller = definition.retainHost ? null : copyHostAttributes(host, template.content);
    if (definition.retainHost) {
        if (input) {
            input.setAttribute(
                "data-cms-composition-host-attributes",
                JSON.stringify(Array.from(host.attributes).map((attribute) => [attribute.name, attribute.value])),
            );
        }
        unwrapCmsHost(host, template.content);
        if (mode === "delivery") {
            host.replaceChildren(...Array.from(template.content.childNodes));
            return;
        }
        host.replaceChildren(
            input!,
            document.createComment(COMPONENT_OUTPUT_START),
            ...Array.from(template.content.childNodes),
            document.createComment(COMPONENT_OUTPUT_END),
        );
        host.setAttribute(COMPOSITION_RUNTIME_ATTRIBUTE, "");
        host.setAttribute(COMPONENT_COMPOSITION_ATTRIBUTE, "");
        return;
    }

    if (mode === "delivery") {
        propagateHostSlot(host, template.content);
        host.replaceWith(...Array.from(template.content.childNodes));
        return;
    }

    const output = document.createElement("cms-composition-output");
    output.setAttribute(COMPOSITION_OUTPUT_ATTRIBUTE, "");
    controller?.setAttribute(COMPOSITION_CONTROLLER_RUNTIME_ATTRIBUTE, "");
    output.append(...Array.from(template.content.childNodes));
    host.replaceChildren(input!, output);
    host.setAttribute(COMPOSITION_RUNTIME_ATTRIBUTE, "");
}

function unwrapCmsHost(host: Element, fragment: DocumentFragment): void {
    const wrapper = Array.from(fragment.children).find((element) => element.localName === "cms-host");
    if (!wrapper) {
        return;
    }
    for (const attribute of Array.from(wrapper.attributes)) {
        host.setAttribute(attribute.name, attribute.value);
    }
    wrapper.replaceWith(...Array.from(wrapper.childNodes));
}

function projectSlots(
    fragment: DocumentFragment,
    authored: Node[],
    mode: CompositionExpansionMode,
): Record<string, string | null> {
    const usedNames = new Set<string>();
    const forwarding: Record<string, string | null> = {};
    for (const slot of Array.from(fragment.querySelectorAll("slot"))) {
        const name = slot.getAttribute("name") ?? "";
        const forwardedSlot = slot.getAttribute("slot");
        const assigned = usedNames.has(name) ? [] : assignedNodes(authored, name);
        usedNames.add(name);
        if (!Object.hasOwn(forwarding, name)) {
            forwarding[name] = forwardedSlot;
        }
        const projected =
            assigned.length > 0
                ? assigned.map((node) => (mode === "preview" ? node : node.cloneNode(true)))
                : Array.from(slot.childNodes);
        remapProjectedSlot(projected, forwardedSlot);
        if (mode === "preview") {
            const encodedName = encodeURIComponent(name);
            const start = slot.ownerDocument.createComment(`${SLOT_START}${encodedName}`);
            const end = slot.ownerDocument.createComment(`${SLOT_END}${encodedName}`);
            if (assigned.length > 0) {
                markAuthored(projected, name);
                slot.replaceWith(start, ...projected, end);
            } else {
                slot.replaceWith(
                    start,
                    end,
                    slot.ownerDocument.createComment(`${FALLBACK_START}${encodedName}`),
                    ...projected,
                    slot.ownerDocument.createComment(`${FALLBACK_END}${encodedName}`),
                );
            }
        } else {
            slot.replaceWith(...projected);
        }
    }
    return forwarding;
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
        if (attribute.name !== "slot" && !attribute.name.startsWith("data-cms-composition")) {
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
