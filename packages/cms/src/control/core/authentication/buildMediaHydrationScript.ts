import type { ControlCms } from "src/control/ControlCms";

/**
 * Serialize the Media instance to a browser-side script that reconstructs it
 * and binds to `window._cms.Media`. Relies on `constructor.toString()` for
 * the class body and a tagged-JSON replacer for the instance state.
 *
 * Limitations worth knowing:
 * - The class must be self-contained: any identifier the method bodies
 *   reference must be resolvable from the browser's global scope or from
 *   the class itself (static helpers, inherited members). Top-level imports
 *   and module-scoped helpers are invisible to `toString()`.
 * - Private fields (`#foo`) are not enumerable and won't survive the
 *   JSON snapshot; use `_foo` conventions if you need to rehydrate state.
 * - `Map`, `Set`, `Date`, `Uint8Array` are preserved via the tagged replacer
 *   below. Anything else serializable-looking goes through `JSON.stringify`
 *   as-is.
 */
export function buildMediaHydrationScript(media: ControlCms["media"]): string {
    const className   = media.constructor.name;
    const classSource = media.constructor.toString();
    const state       = JSON.stringify(media, taggedReplacer);
    // `(0, eval)` runs in the global scope so the class declaration is
    // parsed as an expression and returned. Wrapping the source in `(…)`
    // forces expression context for `class X { … }`.
    return `(() => {
    const __src = ${JSON.stringify(classSource)};
    const Klass = (0, eval)("(" + __src + ")");
    const revive = (_k, v) => {
        if (v && typeof v === "object" && v.__cms_type) {
            if (v.__cms_type === "Date")       return new Date(v.v);
            if (v.__cms_type === "Map")        return new Map(v.v);
            if (v.__cms_type === "Set")        return new Set(v.v);
            if (v.__cms_type === "Uint8Array") return new Uint8Array(v.v);
        }
        return v;
    };
    const state = JSON.parse(${JSON.stringify(state)}, revive);
    const instance = Object.create(Klass.prototype);
    Object.assign(instance, state);
    window._cms = window._cms || {};
    window._cms.Media = instance;
    if (${JSON.stringify(className)} && !(instance instanceof Klass)) {
        console.warn("[cms] hydrated Media instance is not an instance of", ${JSON.stringify(className)});
    }
})();`;
}

function taggedReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Date)       return { __cms_type: "Date",       v: value.toISOString() };
    if (value instanceof Map)        return { __cms_type: "Map",        v: [...value.entries()] };
    if (value instanceof Set)        return { __cms_type: "Set",        v: [...value] };
    if (value instanceof Uint8Array) return { __cms_type: "Uint8Array", v: Array.from(value) };
    return value;
}
