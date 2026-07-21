import { READY_ATTR } from "../attrs";

/**
 * Strip runtime-only stamps from `root` and its subtree before serializing
 * authored content from an editor canvas.
 */
export function clearRuntimeStamps(root: Element): void {
    if (root.hasAttribute(READY_ATTR)) {
        root.removeAttribute(READY_ATTR);
    }
    root.querySelectorAll(`[${READY_ATTR}]`).forEach((el) => el.removeAttribute(READY_ATTR));
}
