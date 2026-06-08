/**
 * The DOM-level binding pass: walk a subtree against a `Scope`, in place,
 * interpolating `{{ token }}`s and expanding `cms-repeat` iteration. Sources
 * (`cms-source`, async fetch) are a boundary here — handled by their own
 * controller — but their nodes mark where this pass must stop.
 *
 * Design rules established here:
 *
 *  - **Write through the DOM APIs.** Text goes through `nodeValue`, attributes
 *    through `setAttribute` — literal-string sinks that never parse markup, so
 *    a resolved value cannot inject HTML. (See `interpolate.ts` for why we do
 *    NOT HTML-escape.)
 *
 *  - **Stop at nested source boundaries.** An element carrying `cms-source`
 *    (other than the root we were handed) owns its own scope and pass. We bind
 *    that element's OWN attributes against the current scope — so a nested
 *    source URL like `cms-source="/api/x/{{ id }}"` can read the parent item —
 *    but we do not descend into its subtree.
 *
 *  - **`cms-repeat` expands into marker + clones.** The template node is
 *    replaced by a comment marker (a stable anchor for a future reload to clear
 *    and re-stamp against), then one clone per item is inserted before it. Each
 *    clone has the `cms-repeat` directive stripped (so a re-scan never
 *    re-expands it) and is bound against a chained child scope. Nested repeats
 *    inside a clone are expanded by the recursive bind. A node may carry both
 *    `cms-repeat` and `cms-source`: each clone keeps `cms-source` (its URL bound
 *    against the item) and the runtime then registers it as its own source.
 */

import { interpolateString, type FilterMap } from "./interpolate";
import { lookup, type Scope } from "./scope";
import { parseRepeat, REPEAT_ATTR } from "./repeat";

export const SOURCE_ATTR = "cms-source";
export { REPEAT_ATTR };

export function bindSubtree(root: Node, scope: Scope, filters: FilterMap = {}): void {
    // A fragment root has no attributes/boundary of its own — bind its children
    // as if it were a parent container (so a top-level `cms-repeat` expands).
    // Binding off-DOM before attaching is how `renderContent` resolves a nested
    // source's URL before the observer can see (and activate) it.
    if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        bindChildren(root, scope, filters);
        return;
    }
    walk(root, scope, filters, true);
}

function walk(node: Node, scope: Scope, filters: FilterMap, isRoot: boolean): void {
    if (node.nodeType === Node.TEXT_NODE) {
        const original = node.nodeValue ?? "";
        const replaced = interpolateString(original, scope, filters);
        if (replaced !== original) node.nodeValue = replaced;
        return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return; // comments, etc.
    const el = node as Element;

    // Snapshot attributes before mutating — interpolation only changes values,
    // but reading a live NamedNodeMap while writing is fragile.
    for (const attr of Array.from(el.attributes)) {
        const replaced = interpolateString(attr.value, scope, filters);
        if (replaced !== attr.value) el.setAttribute(attr.name, replaced);
    }

    // A nested source is a scope boundary: its attrs are bound above (against
    // the parent scope), but its subtree belongs to its own pass.
    if (!isRoot && el.hasAttribute(SOURCE_ATTR)) return;

    bindChildren(el, scope, filters);
}

function bindChildren(parent: Node, scope: Scope, filters: FilterMap): void {
    // Snapshot children before mutating — expanding a repeat replaces one child
    // with [clones…, marker], which must not be re-visited by this loop.
    for (const child of Array.from(parent.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE && (child as Element).hasAttribute(REPEAT_ATTR)) {
            expandRepeat(child as Element, scope, filters);
        } else {
            walk(child, scope, filters, false);
        }
    }
}

function expandRepeat(tpl: Element, scope: Scope, filters: FilterMap): void {
    const parent = tpl.parentNode;
    if (!parent) return;

    const spec = parseRepeat(tpl.getAttribute(REPEAT_ATTR) ?? "");
    const res  = lookup(scope, spec.path);

    // Replace the template with a stable marker, whether or not we stamp.
    const marker = document.createComment(`cms-repeat ${spec.path}`);
    parent.replaceChild(marker, tpl);

    if (!Array.isArray(res.value)) {
        if (res.found && res.value != null) {
            console.warn(`cms-repeat="${spec.path}" expected an array, got`, res.value);
        }
        return; // marker stays as the anchor; nothing stamped
    }

    for (const item of res.value) {
        const clone = tpl.cloneNode(true) as Element;
        clone.removeAttribute(REPEAT_ATTR);
        const childScope: Scope = spec.name
            ? { vars: { [spec.name]: item }, parent: scope }
            : { value: item, parent: scope };
        bindSubtree(clone, childScope, filters);
        parent.insertBefore(clone, marker);
    }
}
