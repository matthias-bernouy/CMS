import {
    inertAttributeName,
    isDynamicBinding,
    isNetworkBindingElement,
    NETWORK_BINDING_ATTRIBUTES,
    NETWORK_ELEMENT_SELECTOR,
    NETWORK_INERT_MARKER_ATTRIBUTE,
    readNetworkBindingAttribute,
    type NetworkBindingAttribute,
} from "./networkBindingModel";

export {
    NETWORK_BINDING_ATTRIBUTES,
    NETWORK_INERT_MARKER_ATTRIBUTE,
    readNetworkBindingAttribute,
    type NetworkBindingAttribute,
} from "./networkBindingModel";

const REQUEST_ATTRIBUTES: readonly NetworkBindingAttribute[] = ["src", "srcset"];
const SELECTION_ATTRIBUTES: readonly NetworkBindingAttribute[] = ["sizes", "media"];
const TEMPLATE_SELECTOR = "template";

/**
 * Convert authored image bindings to attributes that cannot start a request.
 * A dynamic member makes its complete `<picture>` group inert so a static
 * fallback cannot race the unresolved responsive candidates.
 */
export function prepareNetworkInertBindings(root: ParentNode): void {
    const elements = matchingElements(root, NETWORK_ELEMENT_SELECTOR);
    const pictureMembers = new Set<Element>();

    for (const picture of elements.filter((element) => element.localName === "picture")) {
        const members = [
            picture,
            ...Array.from(picture.querySelectorAll("img,source")).filter(
                (element) => element.closest("picture") === picture,
            ),
        ];
        members.forEach((element) => pictureMembers.add(element));
        if (members.some(needsNetworkInert)) {
            members.forEach(makeNetworkInert);
        }
    }

    for (const element of elements) {
        if (!pictureMembers.has(element) && needsNetworkInert(element)) {
            makeNetworkInert(element);
        }
    }

    for (const template of matchingElements(root, TEMPLATE_SELECTOR)) {
        prepareNetworkInertBindings((template as HTMLTemplateElement).content);
    }
}

/**
 * Restore canonical authored markup on a detached serialization clone.
 * Calling this on connected browser content may start network requests.
 */
export function restoreNetworkBindingMarkup(root: ParentNode): void {
    for (const element of matchingElements(root, NETWORK_ELEMENT_SELECTOR)) {
        const marked = element.hasAttribute(NETWORK_INERT_MARKER_ATTRIBUTE);
        for (const name of NETWORK_BINDING_ATTRIBUTES) {
            const inertName = inertAttributeName(name);
            if (element.hasAttribute(inertName)) {
                element.setAttribute(name, element.getAttribute(inertName) ?? "");
                element.removeAttribute(inertName);
            } else if (marked) {
                element.removeAttribute(name);
            }
        }
        element.removeAttribute(NETWORK_INERT_MARKER_ATTRIBUTE);
    }

    for (const template of matchingElements(root, TEMPLATE_SELECTOR)) {
        restoreNetworkBindingMarkup((template as HTMLTemplateElement).content);
    }
}

/**
 * Write authored state without ever exposing a dynamic URL through a live
 * `src`/`srcset`. Existing inert image groups remain inert for static edits.
 */
export function writeNetworkBindingAttribute(
    element: Element,
    name: NetworkBindingAttribute,
    value: string | null,
): void {
    if (!isNetworkBindingElement(element)) {
        if (value === null) {
            element.removeAttribute(name);
        } else {
            element.setAttribute(name, value);
        }
        return;
    }

    const inertName = inertAttributeName(name);
    if (value === null) {
        element.removeAttribute(name);
        element.removeAttribute(inertName);
        return;
    }

    if (isDynamicBinding(value) || (REQUEST_ATTRIBUTES.includes(name) && !value.trim())) {
        element.setAttribute(inertName, value);
        element.removeAttribute(name);
        prepareNetworkInertBindings(
            element.localName === "picture" ? element : (element.closest("picture") ?? element),
        );
        return;
    }

    if (networkGroupIsInert(element)) {
        element.setAttribute(inertName, value);
        element.removeAttribute(name);
        return;
    }

    element.removeAttribute(inertName);
    element.setAttribute(name, value);
}

function makeNetworkInert(element: Element): void {
    const authored = new Map(
        NETWORK_BINDING_ATTRIBUTES.map((name) => [name, readNetworkBindingAttribute(element, name)] as const),
    );
    element.setAttribute(NETWORK_INERT_MARKER_ATTRIBUTE, "");
    for (const name of NETWORK_BINDING_ATTRIBUTES) {
        const value = authored.get(name);
        if (value !== null && value !== undefined) {
            element.setAttribute(inertAttributeName(name), value);
        }
        element.removeAttribute(name);
    }
}

function needsNetworkInert(element: Element): boolean {
    return (
        element.hasAttribute(NETWORK_INERT_MARKER_ATTRIBUTE) ||
        hasInertNetworkAttribute(element) ||
        REQUEST_ATTRIBUTES.some((name) => isPendingRequestValue(readNetworkBindingAttribute(element, name))) ||
        SELECTION_ATTRIBUTES.some((name) => isDynamicBinding(readNetworkBindingAttribute(element, name)))
    );
}

function networkGroupIsInert(element: Element): boolean {
    if (element.hasAttribute(NETWORK_INERT_MARKER_ATTRIBUTE) || hasInertNetworkAttribute(element)) {
        return true;
    }
    const picture = element.localName === "picture" ? element : element.closest("picture");
    if (!picture) {
        return false;
    }
    return [picture, ...Array.from(picture.querySelectorAll("img,source"))].some(
        (member) => member.hasAttribute(NETWORK_INERT_MARKER_ATTRIBUTE) || hasInertNetworkAttribute(member),
    );
}

function hasInertNetworkAttribute(element: Element): boolean {
    return NETWORK_BINDING_ATTRIBUTES.some((name) => element.hasAttribute(inertAttributeName(name)));
}

function isPendingRequestValue(value: string | null): boolean {
    return value !== null && (!value.trim() || isDynamicBinding(value));
}

function matchingElements(root: ParentNode, selector: string): Element[] {
    const matches = typeof (root as Element).matches === "function" && (root as Element).matches(selector);
    return [...(matches ? [root as Element] : []), ...Array.from(root.querySelectorAll(selector))];
}
