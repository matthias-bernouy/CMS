import { classifyLink } from "./classifyLink";
import { getEditorContext } from "./editorContext";

/**
 * Captured originals of `history.pushState` / `history.replaceState`, set
 * by `installNavigationGuard`. The guard replaces the live `history.*`
 * methods with intercepting wrappers, so editor code that legitimately
 * needs to update the URL without firing a navigation request (e.g. the
 * `?mode=view` toggle) must go through these references instead — the
 * live `history.pushState` would route the call into `requestNavigation`.
 */
let _origPushState:    typeof history.pushState    | null = null;
let _origReplaceState: typeof history.replaceState | null = null;

export function rawPushState(state: unknown, _unused: string, url: string | URL): void {
    if (_origPushState) _origPushState.call(history, state, _unused, url);
    else                history.pushState(state, _unused, url);
}

export function rawReplaceState(state: unknown, _unused: string, url: string | URL): void {
    if (_origReplaceState) _origReplaceState.call(history, state, _unused, url);
    else                   history.replaceState(state, _unused, url);
}

/**
 * Programmatic-navigation guard. Patches the only entry points the WebIDL
 * spec lets us redefine:
 *
 *   - `history.pushState(state, _, url)`     // SPA transition
 *   - `history.replaceState(state, _, url)`  // SPA transition
 *
 * `Location.prototype.href` setter, `location.assign`, `location.replace`
 * and `window.location` are all `[[LegacyUnforgeable]]` per WebIDL — the
 * browser refuses redefinition, so a bloc that mutates them slips past
 * the editor entirely. That's caught at PUSH time by `validateBloc`,
 * which rejects the `location.*` mutation patterns and points authors
 * toward `<a href>` or `history.pushState`.
 *
 * Returns a `stop` function so EditorRoot can restore the originals on
 * disconnection — matters for tests; production never tears down.
 */
export function installNavigationGuard(): () => void {
    const origPushState     = history.pushState.bind(history);
    const origReplaceState  = history.replaceState.bind(history);
    _origPushState    = origPushState;
    _origReplaceState = origReplaceState;

    const intercept = (raw: string | URL | null | undefined): boolean => {
        if (raw === null || raw === undefined || raw === "") return false;
        const href = String(raw);
        const ctx  = getEditorContext();
        const cls  = classifyLink(href, location.origin, ctx.knownPagePaths);
        ctx.requestNavigation({ href, classification: cls, via: "programmatic" });
        return true;
    };

    history.pushState = (state, _unused, url) => {
        if (url == null || !intercept(url)) origPushState(state, _unused, url);
    };
    history.replaceState = (state, _unused, url) => {
        if (url == null || !intercept(url)) origReplaceState(state, _unused, url);
    };

    return () => {
        history.pushState     = origPushState;
        history.replaceState  = origReplaceState;
        _origPushState    = null;
        _origReplaceState = null;
    };
}
