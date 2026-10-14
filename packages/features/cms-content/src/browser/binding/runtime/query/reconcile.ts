/** Preserve unchanged JSON branches so a fresh response does not remount their bindings. */
export function shareUnchanged(previous: unknown, next: unknown): unknown {
    if (Object.is(previous, next)) {
        return previous;
    }
    if (Array.isArray(previous) && Array.isArray(next)) {
        const values = next.map((value, index) => shareUnchanged(previous[index], value));
        return previous.length === values.length && values.every((value, index) => Object.is(value, previous[index]))
            ? previous
            : values;
    }
    if (!record(previous) || !record(next)) {
        return next;
    }
    const keys = Object.keys(next);
    let unchanged = Object.keys(previous).length === keys.length;
    const entries = keys.map((key) => {
        const value = shareUnchanged(previous[key], next[key]);
        unchanged &&= Object.hasOwn(previous, key) && Object.is(previous[key], value);
        return [key, value] as const;
    });
    return unchanged ? previous : Object.fromEntries(entries);
}

function record(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
