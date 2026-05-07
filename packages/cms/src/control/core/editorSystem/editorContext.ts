/**
 * Module-scoped editor state shared across handlers that don't have a
 * direct reference to the EditorRoot — link clicks, navigation guard,
 * dirty observer. Set once at editor boot, read from anywhere.
 *
 * Singleton-style on purpose: the editor only ever runs one root at a
 * time per page. Plumbing this through every Editor base-class instance
 * (~10 entry points) would be far more code than the convenience saves.
 */
export type LinkClassification =
    | { kind: "anchor";   target: string }                 // `#section` — scroll within preview
    | { kind: "page";     target: string }                 // `/contact` — internal CMS page (jump editor)
    | { kind: "asset";    target: string }                 // `/uploads/...` — internal file (open new tab)
    | { kind: "external"; target: string }                 // `https://example.com` — open new tab
    | { kind: "mailto";   target: string }                 // `mailto:` / `tel:` / `sms:` — defer to browser
    | { kind: "empty"  ;  target: string };                // no-op (`#`, empty, javascript:void)

export type NavigationRequest = {
    href: string;
    classification: LinkClassification;
    /** Source that triggered the request — used for logging only. */
    via: "link-click" | "modifier-click" | "popover-action" | "programmatic";
};

type Ctx = {
    knownPagePaths: Set<string>;
    /**
     * Maps a page path to the page record's `id`. Editor-shell URLs use
     * `?id=<page-id>` (see `pages.html`), but link hrefs in user content
     * are paths — we resolve one to the other here. Empty until the pages
     * list fetch resolves; in dev with a path-keyed repository, callers
     * can fall back to using the path as id.
     */
    pageIdByPath: Map<string, string>;
    isDirty: () => boolean;
    requestNavigation: (req: NavigationRequest) => void;
};

const noop = (): void => {};

const _ctx: Ctx = {
    knownPagePaths: new Set(),
    pageIdByPath:   new Map(),
    isDirty: () => false,
    requestNavigation: noop,
};

/** Update one or more fields of the active editor context. */
export function setEditorContext(patch: Partial<Ctx>): void {
    Object.assign(_ctx, patch);
}

export function getEditorContext(): Ctx {
    return _ctx;
}

// ── Active link ────────────────────────────────────────────────────────────

/**
 * The `<a>` element the user most-recently clicked in the editor preview.
 * Drives the floating `<cms-link-bar>` and any UI that wants to surface
 * link-aware actions. `null` means "no link selected right now".
 *
 * Cross-module pubsub via a tiny emitter — avoids passing the link
 * reference through three layers of editor classes.
 */
let _activeLink: HTMLAnchorElement | null = null;
const _linkListeners = new Set<(link: HTMLAnchorElement | null) => void>();

export function getActiveLink(): HTMLAnchorElement | null { return _activeLink; }

export function setActiveLink(link: HTMLAnchorElement | null): void {
    if (_activeLink === link) return;
    _activeLink = link;
    for (const fn of _linkListeners) try { fn(link); } catch {}
}

export function onActiveLinkChange(fn: (link: HTMLAnchorElement | null) => void): () => void {
    _linkListeners.add(fn);
    return () => { _linkListeners.delete(fn); };
}

/** Reset the context — useful in tests + when an EditorRoot disconnects. */
export function clearEditorContext(): void {
    _ctx.knownPagePaths = new Set();
    _ctx.pageIdByPath   = new Map();
    _ctx.isDirty = () => false;
    _ctx.requestNavigation = noop;
    setActiveLink(null);
}
