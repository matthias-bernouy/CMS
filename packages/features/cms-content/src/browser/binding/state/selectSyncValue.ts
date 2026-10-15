export function selectSyncValue(value: unknown, path: readonly string[]): unknown {
    let selected = value;
    for (const segment of path) {
        if (Array.isArray(selected)) {
            if (!/^(?:0|[1-9]\d*)$/u.test(segment)) {
                return undefined;
            }
            selected = selected[Number(segment)];
            continue;
        }
        if (!isRecord(selected) || !Object.hasOwn(selected, segment)) {
            return undefined;
        }
        selected = selected[segment];
    }
    return selected;
}

export function shareProjectedValue(previous: unknown, next: unknown): unknown {
    if (Object.is(previous, next)) {
        return previous;
    }
    if (Array.isArray(previous) && Array.isArray(next)) {
        const values = next.map((value, index) => shareProjectedValue(previous[index], value));
        return previous.length === values.length && values.every((value, index) => Object.is(value, previous[index]))
            ? previous
            : values;
    }
    if (!isRecord(previous) || !isRecord(next)) {
        return next;
    }
    const keys = Object.keys(next);
    let unchanged = Object.keys(previous).length === keys.length;
    const entries = keys.map((key) => {
        const value = shareProjectedValue(previous[key], next[key]);
        unchanged &&= Object.hasOwn(previous, key) && Object.is(previous[key], value);
        return [key, value] as const;
    });
    return unchanged ? previous : Object.fromEntries(entries);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
