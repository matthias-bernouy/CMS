import type { Surface, SurfaceExtensionMap } from "./types";

/**
 * Walks `[p9r-identifier]` ancestors from `fromEl` (inclusive), looks up each
 * ancestor's `Editor` via `document.compIdentifierToEditor`, and concatenates
 * the extensions registered for `surface`.
 *
 * Ordering is **inner-first** — the closest editor's extensions come before its
 * outer ancestors, so consumers can prioritize the most-specific scope when
 * rendering (e.g. a richtextbar caret nested inside a `<base-list>` inside a
 * `<base-fetch>` sees the list's extensions first, then the fetch's).
 *
 * Returns `[]` if no ancestor exposes any extension on this surface.
 */
export function collectAncestorExtensions<S extends Surface>(
    fromEl: Element,
    surface: S,
): SurfaceExtensionMap[S][] {
    const out: SurfaceExtensionMap[S][] = [];
    const attr = p9r.attr.EDITOR.IDENTIFIER;
    const selector = `[${attr}]`;
    let el: Element | null = fromEl.matches(selector) ? fromEl : fromEl.closest(selector);
    while (el) {
        const id = el.getAttribute(attr);
        const editor = id ? document.compIdentifierToEditor?.get(id) : undefined;
        if (editor) out.push(...editor.listExtensions(surface));
        el = el.parentElement?.closest(selector) ?? null;
    }
    return out;
}
