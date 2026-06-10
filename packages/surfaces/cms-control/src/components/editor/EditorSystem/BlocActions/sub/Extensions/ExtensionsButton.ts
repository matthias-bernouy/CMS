import { ICON_BRACES } from '../../../../../icons';
import type { BlocActionExtension } from 'cms-control/core/editorSystem/extensions/types';
import { collectAncestorExtensions } from 'cms-control/core/editorSystem/extensions/collectAncestors';

/**
 * Single brace-style button rendered in the BAG when ≥1 ancestor of the
 * selected bloc has published a `blocActions` extension. Click is routed via
 * the BAG's `data-action="extensions"` dispatcher path so the popover opens
 * with the *current* BAG target, not a stale snapshot from render-time.
 *
 * Self-publishing rule: a bloc's OWN `extendBlocActions` extensions are
 * filtered out — that channel is for descendants. `Editor.addCustomAction`
 * covers self-actions.
 *
 * Why the walk starts at `target` (not `target.parentElement`): the
 * `p9r-parent-identifier` fallback inside `collectAncestorExtensions` is
 * how stamped descendants reach a publishing ancestor that isn't a real
 * DOM parent (e.g. a bloc that stamps siblings; an inserted card
 * carries `p9r-parent-identifier` pointing at the publisher). The pid lives
 * ON the target itself, so starting one level higher misses it. We add
 * the explicit self-filter below to preserve the original intent.
 */

export function hasBlocActionExtensions(target: HTMLElement): boolean {
    return collectExtensions(target).length > 0;
}

export function collectExtensions(target: HTMLElement): BlocActionExtension[] {
    const myId     = target.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
    const myEditor = myId ? document.compIdentifierToEditor?.get(myId) : undefined;
    const ownExts  = myEditor ? new Set(myEditor.listExtensions('blocActions')) : new Set();

    const all = collectAncestorExtensions(target, 'blocActions')
        .filter((e: BlocActionExtension) => e.enabled?.({ target }) !== false)
        .filter((e: BlocActionExtension) => !ownExts.has(e));
    // De-dupe by identity. The walk should never see the same extension twice
    // (each editor's registry is independent), but if the observer briefly
    // double-editorizes a bloc mid-mutation we'd otherwise show the same group
    // twice in the popover. Cheap defensive filter.
    return Array.from(new Set(all));
}

export function buildExtensionsButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.setAttribute('data-action', 'extensions');
    btn.setAttribute('title', 'Extensions');
    btn.innerHTML = ICON_BRACES;
    return btn;
}
