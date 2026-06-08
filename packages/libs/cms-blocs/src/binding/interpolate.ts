/**
 * Token interpolation for the data-binding runtime — the pure string layer on
 * top of `lookup`. Given `"Hello {{ user.name }}"` and a scope, returns the
 * substituted string. No DOM here; `bindSubtree` applies this to text nodes and
 * attribute values via the DOM APIs.
 *
 * Two rules carried over from the scope contract:
 *  - **Verbatim on miss.** A token whose path is not owned by any frame is left
 *    exactly as written. This is what lets the runtime run over arbitrary HTML
 *    without erasing tokens it does not own — a sibling source's `{{ x }}`, a
 *    server-side `{{ BASE_PATH }}`, or a literal in prose.
 *  - **Raw, not HTML-escaped.** The resolved value is stringified as-is. Safety
 *    is the consumer's job and comes for free from the DOM APIs: `bindSubtree`
 *    writes through `textContent`/`setAttribute`, which insert literal strings
 *    and never parse markup. HTML-escaping here would double-encode `&`/`<` for
 *    display; it only belongs to HTML-string serialization, which this engine
 *    avoids by design.
 *
 * Filters are injected, not imported: `{{ size | bytes }}` routes the resolved
 * value through `filters.bytes` when present, and falls through to the raw value
 * when the name is unknown. Keeping the filter set out of this module leaves it
 * pure and lets callers decide which filters exist.
 */

import { lookup, type Scope } from "./scope";

export type Filter = (value: unknown) => unknown;
export type FilterMap = Record<string, Filter>;

/** `{{ path }}` or `{{ path | filter }}`. Paths are word chars + dots; the
 *  filter name is a bare word. Surrounding whitespace is ignored. */
const TOKEN = /\{\{\s*([\w.]+)(?:\s*\|\s*(\w+))?\s*\}\}/g;

export function interpolateString(str: string, scope: Scope, filters: FilterMap = {}): string {
    return str.replace(TOKEN, (whole: string, path: string, filter: string | undefined) => {
        const res = lookup(scope, path);
        if (!res.found) return whole; // not ours — leave the token untouched
        const fn = filter ? filters[filter] : undefined;
        const value = fn ? fn(res.value) : res.value;
        return value == null ? "" : String(value);
    });
}
