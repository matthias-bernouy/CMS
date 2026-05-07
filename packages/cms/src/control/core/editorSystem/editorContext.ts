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
    isDirty: () => boolean;
    requestNavigation: (req: NavigationRequest) => void;
};

const noop = (): void => {};

const _ctx: Ctx = {
    knownPagePaths: new Set(),
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

/** Reset the context — useful in tests + when an EditorRoot disconnects. */
export function clearEditorContext(): void {
    _ctx.knownPagePaths = new Set();
    _ctx.isDirty = () => false;
    _ctx.requestNavigation = noop;
}
