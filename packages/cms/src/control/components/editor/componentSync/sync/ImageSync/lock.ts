/**
 * An image managed by `<p9r-image-sync>` is fully owned by the panel: the
 * action bar would be meaningless since the only supported operation is
 * "click → MediaCenter" (or the panel's own Remove). Every action gets
 * locked unconditionally, regardless of `optionnal` / `multi-select` / etc.
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
 * Idempotent: only mutates the DOM (and re-runs `viewEditor`) when at least
 * one DISABLE_* attr isn't already in place. Without this, any sibling
 * MutationObserver fan-out (`ConfigPanel.init` → every sync's `init`)
 * unconditionally re-calls `viewEditor()` on the img, which in turn
 * re-triggers style recalc / action-bar rebuild for every keystroke on an
 * adjacent text node. See perf scenario `image-sync-init-cost`.
 */
export function lockActions(target: HTMLImageElement | null) {
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
