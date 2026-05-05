/**
 * Resolves `target` relative to the current location and forwards every
 * query param of `window.location.search` onto the result. Lets components
 * that live inside an editor page (e.g. `?id=xxx`) hit the right resource
 * without re-reading the page URL themselves.
 */
export function buildRequestUrl(target: string): URL {
    const u = new URL(target, window.location.href);
    for (const [k, v] of new URLSearchParams(window.location.search)) u.searchParams.append(k, v);
    return u;
}
