/**
 * Parsing for the `cms-repeat` directive. Reactive templates own DOM expansion;
 * this is just the pure grammar.
 *
 * Forms:
 *  - `cms-repeat="items"`         → iterate the array at `items`; each item
 *                                   becomes the child scope's implicit value, so
 *                                   `{{ title }}` reads `item.title` and
 *                                   `{{ value }}` is the item itself.
 *  - `cms-repeat="items as row"`  → bind each item to the named var `row`; the
 *                                   child scope stays chained, so `{{ row.title }}`
 *                                   works AND a parent field like `{{ order.id }}`
 *                                   remains reachable (no shadowing ambiguity).
 *  - `cms-repeat="$range(5) as index"` → render five instances with `index`
 *                                        bound to the integers from zero to four.
 */

export { REPEAT_ATTR } from "../core/attrs";

export type RepeatSpec = {
    path: string;
    name?: string;
    rangeCount?: number;
    rangeError?: string;
};

/** `as` requires surrounding whitespace, so a plain path like `tasks` (which
 *  contains the letters "as") is not mistaken for a named binding. The name
 *  must be a valid identifier. */
const AS_FORM = /^\s*(.+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;
const RANGE_FORM = /^\$range\((0|[1-9]\d*)\)$/;
const MAX_RANGE_COUNT = 100;

export function parseRepeat(value: string): RepeatSpec {
    const m = value.match(AS_FORM);
    const spec: RepeatSpec = m ? { path: m[1]!, name: m[2]! } : { path: value.trim() };
    if (!spec.path.startsWith("$range(")) {
        return spec;
    }
    const range = RANGE_FORM.exec(spec.path);
    const count = range ? Number(range[1]) : Number.NaN;
    if (!spec.name) {
        return { ...spec, rangeError: "$range(n) requires an alias." };
    }
    if (!Number.isInteger(count) || count < 0 || count > MAX_RANGE_COUNT) {
        return { ...spec, rangeError: `$range(n) requires an integer from 0 to ${MAX_RANGE_COUNT}.` };
    }
    return { ...spec, rangeCount: count };
}
