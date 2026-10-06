/**
 * Token interpolation for the data-binding runtime — the pure string layer on
 * top of `lookup`. Given `"Hello {{ user.name }}"` and a scope, returns the
 * substituted string. No DOM here; compiled templates apply this to text nodes
 * and attribute values via the DOM APIs.
 *
 * Two rules:
 *  - **Blank on miss.** A token whose path resolves nowhere in the scope chain
 *    renders empty — it's an absent optional field. This is safe in this runtime:
 *    a nested source's tokens are never bound by
 *    an ancestor (the pass stops at the `[cms-source]` boundary), and
 *    `{{ BASE_PATH }}` is server-substituted before the client ever sees it.
 *  - **Raw, not HTML-escaped.** The resolved value is stringified as-is. Safety
 *    is the consumer's job and comes for free from the DOM APIs: text and
 *    attribute binding write literal strings and never parse markup.
 *    HTML-escaping here would double-encode `&`/`<` for display; it only
 *    belongs to HTML-string serialization, which this engine avoids by design.
 *
 * Host filters are injected: `{{ size | bytes }}` routes the resolved value
 * through `filters.bytes` when present. The runtime also owns the generic
 * `urlencode` filter because interpolated URL values must be encoded before
 * browsers parse their query strings (`+` otherwise becomes a space).
 */

import { lookup, type Scope } from "./scope";

export type Filter = (value: unknown, ...args: unknown[]) => unknown;
export type FilterMap = Record<string, Filter>;

const BUILTIN_FILTERS = createBuiltinFilters();

export function bindingFilter(name: string, filters: FilterMap): Filter | undefined {
    return Object.hasOwn(filters, name)
        ? filters[name]
        : Object.hasOwn(BUILTIN_FILTERS, name)
          ? BUILTIN_FILTERS[name]
          : undefined;
}

export function createBuiltinFilters(locale?: string): FilterMap {
    const normalizedLocale = locale?.trim() || undefined;
    return {
        dateLong: (value) => formatLongDate(value, normalizedLocale),
        minorCurrency: (value, currency) => formatMinorCurrency(value, currency, normalizedLocale),
        urlencode: (value) => encodeURIComponent(value == null ? "" : String(value)),
    };
}

/** `{{ path }}`, `{{ path | filter }}`, or `{{ path | filter(arg.path) }}`.
 * Paths are word chars, `$`, `.`, and `-`; the filter name is a bare word. */
const TOKEN = /\{\{\s*([\w$.-]+)(?:\s*\|\s*(\w+)(?:\(\s*([\w$.-]+)\s*\))?)?\s*\}\}/g;

export function interpolateString(str: string, scope: Scope, filters: FilterMap = {}): string {
    return str.replace(
        TOKEN,
        (_whole: string, path: string, filter: string | undefined, argPath: string | undefined) => {
            const res = lookup(scope, path);
            if (!res.found) {
                return ""; // absent in the whole scope chain → blank
            }
            const fn = filter ? bindingFilter(filter, filters) : undefined;
            const argument = argPath ? lookup(scope, argPath) : null;
            const value = fn ? fn(res.value, argument?.found ? argument.value : undefined) : res.value;
            return value == null ? "" : String(value);
        },
    );
}

function formatLongDate(value: unknown, locale?: string): string {
    const date = new Date(String(value ?? ""));
    if (Number.isNaN(date.getTime())) {
        return "—";
    }
    return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}

function formatMinorCurrency(value: unknown, currency: unknown, locale?: string): string {
    const amount = Number(value);
    const unit = String(currency ?? "")
        .trim()
        .toUpperCase();
    if (!Number.isSafeInteger(amount) || !unit) {
        return "—";
    }
    try {
        return new Intl.NumberFormat(locale, { style: "currency", currency: unit }).format(amount / 100);
    } catch {
        return "—";
    }
}
