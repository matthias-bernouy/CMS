/**
 * Runtime constants exposed globally via `window.p9r`. Installed at the top of
 * the consolidated editor bundle (`admin-ui/editor-script.client.ts`). Server
 * code that can't touch `window` imports these directly instead.
 *
 * Add to this file whenever a magic string ends up duplicated across call
 * sites — the whole point is to have a single source of truth.
 */

export const P9R_MODE = {
    EDITOR: "editor-mode",
    VIEW:   "view-mode",
} as const;

export type P9RMode = typeof P9R_MODE[keyof typeof P9R_MODE];

export const P9R_EVENT = {
    /** Dispatched on `document` when the editor toggles between editor/view mode. */
    SWITCH_MODE:    "switch-mode",
    BLOC_SELECTED:  "p9r-bloc-selected",
    IMAGE_SELECTED: "p9r-image-selected",
} as const;

/** DOM element ids used by both the editor page HTML and its client/server code. */
export const P9R_ID = {
    EDITOR_SYSTEM: "editor-system",
    EDITOR:        "editor",
} as const;

/**
 * Cache key builders. Every `system.cache.{get,set,delete}` call should go
 * through one of these so the prefixes stay consistent and greppable.
 */
export const P9R_CACHE = {
    bloc: (id: string) => `bloc:${id}`,
    page: (path: string) => `page:${path}`,
    css:  (url: string) => `css:${url}`,
    js:   (url: string) => `js:${url}`,
    html: (url: string) => `html:${url}`,
    font: (url: string) => `font:${url}`,
    /** The single theme CSS served at `/style`. */
    STYLE: "style:main",
    /**
     * Consolidated editor bundle served at `<admin>/admin/editor-script`.
     * Contains the static editor runtime plus every bloc's editorJS and
     * viewJS concatenated — invalidated on any bloc write.
     */
    EDITOR_SCRIPT: "js:editor-script",
} as const;

/**
 * Public path prefix served by the bucket edge that proxies bloc data
 * fetches to the registered upstream API of a Data Provider. The shape
 * `<DATA_PROXY_PREFIX>/<providerId>/<operationPath>` is the wire contract
 * between the page (production or editor preview), the edge proxy, and
 * the editor mock interceptor — keep all three in sync via this constant.
 */
export const DATA_PROXY_PREFIX = "/.cms/data";

export function buildDataProxyUrl(providerId: string, path: string): string {
    const tail = path.startsWith("/") ? path : `/${path}`;
    return `${DATA_PROXY_PREFIX}/${providerId}${tail}`;
}

/**
 * Inverse of `buildDataProxyUrl`. Accepts an absolute path or a fully-
 * qualified URL, returns `{ providerId, path }` if it matches the proxy
 * shape, `null` otherwise. The `path` always starts with `/` and excludes
 * any query string — callers carry the verb / query separately.
 */
export function parseDataProxyUrl(raw: string): { providerId: string; path: string } | null {
    let pathname: string;
    try { pathname = new URL(raw, "http://_").pathname; }
    catch { return null; }
    const prefix = `${DATA_PROXY_PREFIX}/`;
    if (!pathname.startsWith(prefix)) return null;
    const rest  = pathname.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash < 0) {
        return rest ? { providerId: rest, path: "/" } : null;
    }
    const providerId = rest.slice(0, slash);
    const path       = rest.slice(slash) || "/";
    if (!providerId) return null;
    return { providerId, path };
}
