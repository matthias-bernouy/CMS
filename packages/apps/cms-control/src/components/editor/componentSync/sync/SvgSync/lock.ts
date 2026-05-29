/**
 * An SVG managed by `<p9r-svg-sync>` is fully owned by the panel: the only
 * supported operation is "click → MediaCenter swap". Every editor action
 * gets locked unconditionally so the user can't delete / duplicate /
 * change-bloc the slotted SVG from the action bar.
 *
 * Mirror of `ImageSync/lock.ts` adapted to `SVGElement`. The two could
 * share a generic helper, but keeping them per-sync avoids the cross-file
 * indirection for a list that changes once a year.
 */
const LOCKED_ACTIONS = [
    "DISABLE_DELETE",
    "DISABLE_DUPLICATE",
    "DISABLE_ADD_BEFORE",
    "DISABLE_ADD_AFTER",
    "DISABLE_CHANGE_COMPONENT",
    "DISABLE_DRAGGING",
    "DISABLE_SAVE_AS_TEMPLATE",
] as const;

/**
 * Idempotent: only mutates the DOM (and re-runs `viewEditor`) when at
 * least one DISABLE_* attr isn't already in place. Same perf rationale as
 * `ImageSync/lock.ts` — sibling sync init fan-out would otherwise re-call
 * `viewEditor()` on the SVG for every keystroke on an adjacent text node.
 */
export function lockActions(target: SVGElement | null) {
    if (!target) return;
    let changed = false;
    for (const key of LOCKED_ACTIONS) {
        const attr = p9r.attr.ACTION[key];
        if (target.getAttribute(attr) !== "true") {
            target.setAttribute(attr, "true");
            changed = true;
        }
    }
    if (!changed) return;
    const id = target.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
    if (id) {
        const editor = document.compIdentifierToEditor?.get(id);
        editor?.viewEditor();
    }
}
