import type { Surface, SurfaceExtensionMap } from "./types";

/**
 * Walks `[p9r-identifier]` ancestors from `fromEl` (inclusive), looks up each
 * ancestor's `Editor` via `document.compIdentifierToEditor`, and concatenates
 * the extensions registered for `surface`.
 *
 * Ordering is **inner-first** — the closest editor's extensions come before its
 * outer ancestors, so consumers can prioritize the most-specific scope when
 * rendering (e.g. a richtextbar caret nested inside a `<base-list>` inside a
 * data-source bloc sees the list's extensions first, then the source's).
 *
 * Panel-input shortcut: when `fromEl` lives in a config panel (detached
 * from the bloc DOM tree, so `closest([p9r-identifier])` finds nothing)
 * but carries a `PARENT_IDENTIFIER`, resolve that to its owner editor
 * and start the walk from the owner's target. This lets inputs in
 * panels see their owning bloc's ancestor chain without each consumer
 * plumbing the lookup itself.
 *
 * `PARENT_IDENTIFIER` is treated as an *additional* edge at every step,
 * not just a fallback. A bloc that publishes DOM siblings, not children,
 * is reached through
 * the pid posted on its stamps; the stamps' own DOM parent leads
 * elsewhere (the document root, an article wrapper, …). Walking only
 * via DOM ancestors would miss the publisher in that case. We therefore
 * BFS both edges (DOM parent + pid hop) at each visited node, with a
 * visited set to keep the walk finite.
 *
 * Returns `[]` if no ancestor exposes any extension on this surface.
 */
export function collectAncestorExtensions<S extends Surface>(
    fromEl: Element,
    surface: S,
): SurfaceExtensionMap[S][] {
    const out: SurfaceExtensionMap[S][] = [];
    const idAttr   = p9r.attr.EDITOR.IDENTIFIER;
    const pidAttr  = p9r.attr.EDITOR.PARENT_IDENTIFIER;
    const selector = `[${idAttr}]`;
    const map      = document.compIdentifierToEditor;

    let entry: Element = fromEl;
    if (!entry.closest(selector)) {
        const pidEl = entry.closest(`[${pidAttr}]`);
        const pid   = pidEl?.getAttribute(pidAttr);
        const owner = pid ? map?.get(pid) : undefined;
        if (owner) entry = owner.target;
    }

    const seed = entry.matches(selector) ? entry : entry.closest(selector);
    if (!seed) return out;

    const visited = new Set<Element>();
    const queue: Element[] = [seed];
    while (queue.length > 0) {
        const el = queue.shift()!;
        if (visited.has(el)) continue;
        visited.add(el);

        const id = el.getAttribute(idAttr);
        const editor = id ? map?.get(id) : undefined;
        if (editor) out.push(...editor.listExtensions(surface));

        const parent = el.parentElement?.closest(selector);
        if (parent && !visited.has(parent)) queue.push(parent);

        const pid = el.getAttribute(pidAttr);
        const pidOwner = pid ? map?.get(pid) : undefined;
        if (pidOwner && pidOwner.target !== el && !visited.has(pidOwner.target)) {
            queue.push(pidOwner.target);
        }
    }
    return out;
}
