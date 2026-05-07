import { classifyLink } from "./classifyLink";
import { getEditorContext } from "./editorContext";

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
    };
}
