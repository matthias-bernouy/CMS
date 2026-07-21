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
 */

export { REPEAT_ATTR } from "../attrs";

export type RepeatSpec = { path: string; name?: string };

/** `as` requires surrounding whitespace, so a plain path like `tasks` (which
 *  contains the letters "as") is not mistaken for a named binding. The name
 *  must be a valid identifier. */
const AS_FORM = /^\s*(.+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;

export function parseRepeat(value: string): RepeatSpec {
    const m = value.match(AS_FORM);
    if (m) {
        return { path: m[1]!, name: m[2]! };
    }
    return { path: value.trim() };
}
