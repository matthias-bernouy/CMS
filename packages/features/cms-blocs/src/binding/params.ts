/**
 * Query-param state — the reactive layer of the binding runtime.
 *
 * A `cms-source` URL can reference query params with `#{name}` tokens. They
 * resolve against the current address-bar query string just before each fetch,
 * and a source that references any param reloads when the params change (via
 * `setParam`, or the browser back/forward button).
 *
 * This is deliberately distinct from `{{ }}` data tokens: `{{ }}` resolves once
 * at render time against fetched data; `#{}` resolves per-fetch against page
 * state and is REACTIVE. Keeping the syntaxes separate keeps "when and against
 * what does this resolve" unambiguous.
 */

export const PARAMS_CHANGE_EVENT = "cms-params:change";

const PARAM_TOKEN = /#\{\s*(\w+)\s*\}/g;

/** Whether a `cms-source` template depends on any query param. Matches exactly
 *  what `resolveParams` substitutes, so a malformed `#{a-b}` is neither resolved
 *  nor treated as reactive (it stays literal, no param listeners attached). */
export function hasParamTokens(template: string): boolean {
    return /#\{\s*\w+\s*\}/.test(template);
}

/** Current query params from the address bar. */
export function currentParams(): URLSearchParams {
    return new URLSearchParams(typeof location === "undefined" ? "" : location.search);
}

/** Replace `#{name}` tokens with URL-encoded param values (missing → ""). */
export function resolveParams(template: string, params: URLSearchParams = currentParams()): string {
    return template.replace(PARAM_TOKEN, (_m, name: string) => encodeURIComponent(params.get(name) ?? ""));
}

/**
 * Set (or clear, when value is "") a query param WITHOUT navigating, then notify
 * dependent sources. Empty values are removed so the URL stays clean and
 * bookmarkable.
 */
export function setParam(name: string, value: string): void {
    const params = currentParams();
    if (value === "") params.delete(name);
    else params.set(name, value);
    const qs = params.toString();
    history.replaceState(history.state, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
    document.dispatchEvent(new Event(PARAMS_CHANGE_EVENT));
}
