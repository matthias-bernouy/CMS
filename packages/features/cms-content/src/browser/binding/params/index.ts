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
export const STATE_CHANGE_EVENT = "cms-state:change";

const QUERY_PARAM_NAME_PATTERN = "[A-Za-z0-9_][A-Za-z0-9_.:-]*";
const PARAM_TOKEN = new RegExp(`#\\{\\s*(${QUERY_PARAM_NAME_PATTERN})\\s*\\}`, "g");
const HAS_PARAM_TOKEN = new RegExp(`#\\{\\s*${QUERY_PARAM_NAME_PATTERN}\\s*\\}`);
const STATE_TOKEN = /@\{\s*([A-Za-z0-9_.-]+)\s*\}/g;
const STATE_BY_DOCUMENT = new WeakMap<Document, Map<string, string>>();

/** Whether a `cms-source` template depends on any query param. Matches exactly
 *  what `resolveParams` substitutes, including operator-qualified names. */
export function hasParamTokens(template: string): boolean {
    return HAS_PARAM_TOKEN.test(template);
}

/** Whether a `cms-source` template depends on local page state. */
export function hasStateTokens(template: string): boolean {
    return /@\{\s*[A-Za-z0-9_.-]+\s*\}/.test(template);
}

/** Current query params from the address bar. */
export function currentParams(): URLSearchParams {
    return new URLSearchParams(typeof location === "undefined" ? "" : location.search);
}

/** Replace `#{name}` tokens with URL-encoded param values (missing → ""). */
export function resolveParams(template: string, params: URLSearchParams = currentParams()): string {
    return template.replace(PARAM_TOKEN, (_m, name: string) => encodeURIComponent(params.get(name) ?? ""));
}

/** Replace `@{name}` tokens with URL-encoded local page state values. */
export function resolveState(template: string, doc: Document = document): string {
    const state = stateForDocument(doc);
    return template.replace(STATE_TOKEN, (_m, name: string) => encodeURIComponent(state.get(name) ?? ""));
}

/**
 * Set (or clear, when value is "") a query param WITHOUT navigating, then notify
 * dependent sources. Empty values are removed so the URL stays clean and
 * bookmarkable.
 */
export function setParam(name: string, value: string): void {
    const params = currentParams();
    if (value === "") {
        params.delete(name);
    } else {
        params.set(name, value);
    }
    const qs = params.toString();
    history.replaceState(history.state, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
    document.dispatchEvent(new Event(PARAMS_CHANGE_EVENT));
}

export function currentState(name: string, doc: Document = document): string {
    return stateForDocument(doc).get(name.trim()) ?? "";
}

export function setState(name: string, value: string, doc: Document = document): void {
    const key = name.trim();
    if (!key) {
        return;
    }
    const state = stateForDocument(doc);
    const next = value;
    const previous = state.get(key) ?? "";
    if (next === "") {
        state.delete(key);
    } else {
        state.set(key, next);
    }
    if (next !== previous) {
        doc.dispatchEvent(new Event(STATE_CHANGE_EVENT));
    }
}

function stateForDocument(doc: Document): Map<string, string> {
    let state = STATE_BY_DOCUMENT.get(doc);
    if (!state) {
        state = new Map();
        STATE_BY_DOCUMENT.set(doc, state);
    }
    return state;
}
