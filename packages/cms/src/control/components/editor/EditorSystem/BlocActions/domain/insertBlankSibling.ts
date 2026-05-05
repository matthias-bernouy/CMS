/**
 * Resolves the parent's <p9r-comp-sync> template that matches `target`'s
 * slot — the same source `_sync()` and `_add()` use for default-cloning.
 * Returns `null` if no parent editor / no matching comp-sync is found.
 */
function resolveSiblingTemplate(target: HTMLElement): HTMLElement | null {
    const parentId = target.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
    if (!parentId) return null;
    const parentEditor = document.compIdentifierToEditor?.get(parentId) as any;
    if (!parentEditor) return null;
    const slotName = target.getAttribute('slot');
    const compSyncs = parentEditor.queryPanelChildren('p9r-comp-sync') as Element[];
    for (const cs of compSyncs) {
        const template = cs.firstElementChild as HTMLElement | null;
        if (!template) continue;
        const tSlot = template.getAttribute('slot');
        if ((slotName ?? null) === (tSlot ?? null)) {
            return template;
        }
    }
    return null;
}

/**
 * Inserts a fresh sibling next to `target`. Deep-clones the parent
 * comp-sync template — the same source `_sync()` (first insertion) and
 * `_add()` (panel "+ Add") use — so the new element carries any default
 * attributes AND default child content the template declared (e.g. a
 * `<nav-item>` template that contains a `<hub-button>` default would
 * have stripped that child if we'd only kept the tag). Falls back to a
 * bare `<p>` when no template can be resolved.
 */
export function insertBlankSibling(target: HTMLElement, position: 'before' | 'after') {
    const template = resolveSiblingTemplate(target);
    const fresh = template
        ? template.cloneNode(true) as HTMLElement
        : document.createElement('p');

    const parentId = target.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
    if (parentId) fresh.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, parentId);
    const slot = target.getAttribute('slot');
    if (slot) fresh.setAttribute('slot', slot);
    fresh.setAttribute(p9r.attr.EDITOR.IS_CREATING, 'true');

    if (position === 'before') target.before(fresh);
    else target.after(fresh);
}
