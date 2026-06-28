/**
 * Slot handling for `cms-source`. A source element's children split into:
 *  - `[cms-slot="loading"|"error"|"empty"]` → state slots,
 *  - everything else → the `body` (the default data template).
 *
 * The split is captured ONCE, off-DOM, into pristine fragments. Source success
 * bodies compile that pristine body into a reactive region; state slots still
 * render by cloning and binding their captured fragments.
 */

import { bindSubtree } from "./bindSubtree";
import { type Scope } from "../scope";
import { type FilterMap } from "../interpolate";
import { isSourceSlotValue, SLOT_ATTR, type SourceSlotValue } from "../attrs";

export type SlotName = SourceSlotValue;

export type Captured = {
    /** Authored editable template, including state slots with their attrs. */
    template: DocumentFragment;
    /** Default content — the data template, bound on success. */
    body: DocumentFragment;
    /** State slots, when present. */
    slots: Partial<Record<SlotName, DocumentFragment>>;
};

/**
 * Move a source element's children off-DOM into pristine fragments, leaving the
 * element empty and ready to render a state into. Slot children lose their
 * `cms-slot` attribute (it has served its purpose); all direct children for the
 * same state are kept in that state's fragment.
 *
 * A `<template>` body is captured INERT (its `.content`): the custom elements
 * inside never upgraded, so they can't pre-render with raw tokens or duplicate
 * their light-DOM UI when the body is cloned and stamped. Use it whenever the
 * body holds active components (forms, media inputs). Live (non-template)
 * children are captured as-is — fine for idempotent elements like table rows,
 * and required where rows must be direct children for `<slot>` distribution.
 */
export function captureContent(el: Element): Captured {
    const slots: Partial<Record<SlotName, DocumentFragment>> = {};
    const body = document.createDocumentFragment();
    const template = document.createDocumentFragment();

    for (const child of Array.from(el.childNodes)) {
        template.appendChild(cloneAuthoredNode(child));
        const slot = slotOf(child);
        if (!slot) {
            if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName === "TEMPLATE") {
                body.appendChild((child as HTMLTemplateElement).content); // inert
                (child as Element).remove();
            } else {
                body.appendChild(child); // live — moves it out of el
            }
            continue;
        }
        (child as Element).removeAttribute(SLOT_ATTR);
        const frag = slots[slot] ?? document.createDocumentFragment();
        frag.appendChild(child);
        slots[slot] = frag;
    }
    return { template, body, slots };
}

/**
 * Render a captured state fragment into `el`: clear whatever was rendered
 * before, append a fresh deep clone, then bind it against `scope`. A null scope
 * renders static content (e.g. a loading slot with no tokens) — tokens left
 * verbatim. Source bodies use the reactive template runtime instead.
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
    return isSourceSlotValue(v) ? v : null;
}

function cloneAuthoredNode(node: Node): Node {
    return node.cloneNode(true);
}
