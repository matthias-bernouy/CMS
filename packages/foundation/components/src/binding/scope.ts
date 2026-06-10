/**
 * Scope resolution for the data-binding runtime.
 *
 * A `Scope` is one frame in a cascade (think CSS custom properties / React
 * context): a `lookup` that misses in the current frame walks up `parent`
 * until a frame owns the path's head segment — or runs out of frames.
 *
 * Two ways a frame can carry data:
 *  - `value` — the implicit current value. A bare path like `title` reads
 *              `value.title`; the reserved path `value` returns it directly.
 *              Set by a bare `cms-repeat="items"`: the item replaces context.
 *  - `vars`  — named bindings. The path `line.x` reads `vars.line.x`. Set by a
 *              named `cms-repeat="items as line"`, and later by a source id →
 *              its data, or page globals → `{ query, route, user }`.
 *
 * `lookup` returns `{ found }` so callers can distinguish "resolved to
 * null/undefined" from "no such path in any frame". The interpolator renders
 * both as empty (an absent field blanks, like the old fetch renderer) but keeps
 * the distinction so it never runs a filter on a missing value.
 *
 * Found-ness is decided at the HEAD segment: once a frame owns the head, deeper
 * missing keys yield `undefined` (found stays true) rather than bubbling to a
 * parent or failing — a token addressed to a real scope is ours, even when one
 * of its fields happens to be absent.
 */

export type Scope = {
    /** Implicit current value — bare `{{ title }}` reads `value.title`. */
    value?:  unknown;
    /** Named bindings — `{{ line.x }}` reads `vars.line.x`. */
    vars?:   Record<string, unknown>;
    /** Enclosing frame; lookup walks up when the head segment misses here. */
    parent?: Scope;
};

export type Lookup = { found: boolean; value: unknown };

const NOT_FOUND: Lookup = { found: false, value: undefined };

/**
 * Resolve a dotted `path` against `scope` and its ancestor chain.
 * See the module doc for the found-ness and `value` reserved-word rules.
 */
export function lookup(scope: Scope, path: string): Lookup {
    // `.` is the current context itself — the implicit value of this frame.
    // Used by `cms-repeat="."` (iterate the payload directly) and `{{ . }}`.
    if (path === ".") return { found: true, value: scope.value };
    if (path === "value") return { found: true, value: implicitValue(scope) };

    const dot  = path.indexOf(".");
    const head = dot === -1 ? path : path.slice(0, dot);
    const rest = dot === -1 ? ""   : path.slice(dot + 1);

    for (let frame: Scope | undefined = scope; frame; frame = frame.parent) {
        if (frame.vars && head in frame.vars) {
            return { found: true, value: descend(frame.vars[head], rest) };
        }
        const v = frame.value;
        if (isObject(v) && head in v) {
            return { found: true, value: descend((v as Record<string, unknown>)[head], rest) };
        }
    }
    return NOT_FOUND;
}

/**
 * `{{ value }}` — the nearest frame's implicit value, or its `.value` key when
 * that value is an object carrying one (parity with arrays of `{ key, value }`
 * rows). Always resolves: a named loop should use its name, but `value` on an
 * empty frame returning `undefined` is still a deliberate (found) result.
 */
function implicitValue(scope: Scope): unknown {
    const v = scope.value;
    if (isObject(v) && "value" in v) return (v as Record<string, unknown>).value;
    return v;
}

/**
 * Walk the remaining dotted segments as plain key accesses. A null/undefined
 * hop short-circuits to `undefined` — the head already settled found-ness.
 * Array indices and `length` resolve naturally (`items.0.name`, `items.length`).
 */
function descend(value: unknown, rest: string): unknown {
    if (rest === "") return value;
    let cur = value;
    for (const key of rest.split(".")) {
        if (cur == null) return undefined;
        cur = (cur as Record<string, unknown>)[key];
    }
    return cur;
}

function isObject(v: unknown): v is object {
    return v !== null && typeof v === "object";
}
