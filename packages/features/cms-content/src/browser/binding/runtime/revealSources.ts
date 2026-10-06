import { BIND_STOP_ATTR, READY_ATTR, SOURCE_ATTR } from "../core/attrs";

export function revealSources(root: Node): void {
    if (root.nodeType !== Node.ELEMENT_NODE) {
        return;
    }

    const el = root as Element;
    if (el.hasAttribute(SOURCE_ATTR)) {
        el.setAttribute(READY_ATTR, "");
    }
    el.querySelectorAll(`[${SOURCE_ATTR}]`).forEach((source) => source.setAttribute(READY_ATTR, ""));
}

export function revealInertSources(root: Node): void {
    if (root.nodeType !== Node.ELEMENT_NODE) {
        return;
    }

    const el = root as Element;
    if (el.hasAttribute(BIND_STOP_ATTR)) {
        revealSources(el);
        return;
    }
    el.querySelectorAll(`[${BIND_STOP_ATTR}]`).forEach(revealSources);
}
