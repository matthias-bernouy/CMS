import { BINDING_CORE_TAG } from "../core/attrs";

/**
 * Invoke `cb` for `node` and every descendant carrying `attr`, without crossing
 * nested binding-core boundaries.
 */
export function eachMatching(node: Node, attr: string, root: Element, cb: (el: Element) => void): void {
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
    }

    const el = node as Element;
    if (el !== root && crossesBoundary(el, root)) {
        return;
    }
    if (el.hasAttribute(attr)) {
        cb(el);
    }
    el.querySelectorAll(`[${attr}]`).forEach((inner) => {
        if (!crossesBoundary(inner, root)) {
            cb(inner);
        }
    });
}

function crossesBoundary(el: Element, root: Element): boolean {
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        if (p.localName === BINDING_CORE_TAG) {
            return true;
        }
    }
    return false;
}
