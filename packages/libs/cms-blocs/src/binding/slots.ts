/**
 * Slot handling for `cms-source`. A source element's children split into:
 *  - `[cms-slot="loading"|"error"|"empty"]` → state slots,
 *  - everything else → the `body` (the default data template).
 *
 * The split is captured ONCE, off-DOM, into pristine fragments; every render
 * clones the relevant fragment. This is what makes reload clean — the data
 * template (which `bindSubtree` mutates: stamping clones, replacing tokens) is
 * never consumed in place, so the next render starts from a fresh copy.
 */

import { bindSubtree } from "./bindSubtree";
import { type Scope } from "./scope";
import { type FilterMap } from "./interpolate";

export const SLOT_ATTR = "cms-slot";

export type SlotName = "loading" | "error" | "empty";
const SLOT_NAMES: readonly SlotName[] = ["loading", "error", "empty"];

export type Captured = {
    /** Default content — the data template, bound on success. */
    body: DocumentFragment;
    /** State slots, when present. */
    slots: Partial<Record<SlotName, DocumentFragment>>;
};

/**
 * Move a source element's children off-DOM into pristine fragments, leaving the
 * element empty and ready to render a state into. Slot children lose their
 * `cms-slot` attribute (it has served its purpose); only the first node per
 * slot is kept, extras are dropped.
 */
export function captureContent(el: Element): Captured {
    const slots: Partial<Record<SlotName, DocumentFragment>> = {};
    const body = document.createDocumentFragment();

    for (const child of Array.from(el.childNodes)) {
        const slot = slotOf(child);
        if (!slot) {
            body.appendChild(child); // moves it out of el
            continue;
        }
        (child as Element).removeAttribute(SLOT_ATTR);
        if (slots[slot]) {
            child.parentNode?.removeChild(child); // already filled — drop the extra
        } else {
            const frag = document.createDocumentFragment();
            frag.appendChild(child);
            slots[slot] = frag;
        }
    }
    return { body, slots };
}

/**
 * Render a captured fragment into `el`: clear whatever was rendered before,
 * append a fresh deep clone, then bind it against `scope`. A null scope renders
 * static content (e.g. a loading slot with no tokens) — tokens left verbatim.
 */
export function renderContent(
    el: Element,
    fragment: DocumentFragment,
    scope: Scope | null,
    filters: FilterMap = {},
): void {
    const clone = fragment.cloneNode(true) as DocumentFragment;
    // Bind off-DOM, BEFORE attaching: a nested source's URL must be resolved
    // before the node becomes observable, or the runtime would activate it with
    // an un-interpolated `cms-source` (the observer can fire synchronously).
    if (scope) bindSubtree(clone, scope, filters);
    el.replaceChildren(clone);
}

/** Whether a successful payload should fall to the `empty` slot. */
export function isEmpty(data: unknown): boolean {
    if (data == null) return true;
    if (Array.isArray(data)) return data.length === 0;
    if (typeof data === "object") return Object.keys(data as object).length === 0;
    return false;
}

function slotOf(node: Node): SlotName | null {
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const v = (node as Element).getAttribute(SLOT_ATTR);
    return v && (SLOT_NAMES as readonly string[]).includes(v) ? (v as SlotName) : null;
}
