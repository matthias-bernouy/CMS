export const NETWORK_BINDING_ATTRIBUTES = ["src", "srcset", "sizes", "media", "width", "height"] as const;

export type NetworkBindingAttribute = (typeof NETWORK_BINDING_ATTRIBUTES)[number];

export const NETWORK_INERT_MARKER_ATTRIBUTE = "data-cms-network-inert";
export const NETWORK_ELEMENT_SELECTOR = "img,picture,source";

/** Read authored state regardless of whether the element is active or inert. */
export function readNetworkBindingAttribute(element: Element, name: NetworkBindingAttribute): string | null {
    if (!isNetworkBindingElement(element)) {
        return element.getAttribute(name);
    }
    const inertName = inertAttributeName(name);
    if (element.hasAttribute(inertName)) {
        return element.getAttribute(inertName);
    }
    return element.hasAttribute(NETWORK_INERT_MARKER_ATTRIBUTE) ? null : element.getAttribute(name);
}

export function inertAttributeName(name: NetworkBindingAttribute): `data-cms-${NetworkBindingAttribute}` {
    return `data-cms-${name}`;
}

export function isDynamicBinding(value: string | null): boolean {
    return value?.includes("{{") ?? false;
}

export function isNetworkBindingElement(element: Element): boolean {
    return element.matches(NETWORK_ELEMENT_SELECTOR);
}
