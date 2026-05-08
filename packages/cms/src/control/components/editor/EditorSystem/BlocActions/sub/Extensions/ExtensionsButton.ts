import { ICON_BRACES } from '../../../../../icons';
import type { BlocActionExtension } from 'src/control/core/editorSystem/extensions/types';
import { collectAncestorExtensions } from 'src/control/core/editorSystem/extensions/collectAncestors';

/**
 * Single brace-style button rendered in the BAG when ≥1 ancestor of the
 * selected bloc has published a `blocActions` extension. Click is routed via
 * the BAG's `data-action="extensions"` dispatcher path so the popover opens
 * with the *current* BAG target, not a stale snapshot from render-time.
 *
 * The walk starts at `target.parentElement` so the bloc's OWN editor doesn't
 * see its own `extendBlocActions` (that channel is for descendants —
 * `Editor.addCustomAction` covers self-actions).
 */

export function hasBlocActionExtensions(target: HTMLElement): boolean {
    return collectExtensions(target).length > 0;
}

export function collectExtensions(target: HTMLElement): BlocActionExtension[] {
    const startEl = target.parentElement;
    if (!startEl) return [];
    const all = collectAncestorExtensions(startEl, 'blocActions')
        .filter((e: BlocActionExtension) => e.enabled?.() !== false);
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
