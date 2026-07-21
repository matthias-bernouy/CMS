export function valueAt(value: unknown, path: string | undefined): unknown {
    if (!path) {
        return value;
    }
    let current = value;
    for (const segment of path.split(".").filter(Boolean)) {
        if (!isRecord(current)) {
            return undefined;
        }
        current = current[segment];
    }
    return current;
}

export function arrayAt(value: unknown, path: string | undefined): unknown[] {
    const found = valueAt(value, path);
    return Array.isArray(found) ? found : [];
}

export function textAt(value: unknown, path: string | undefined): string {
    const found = valueAt(value, path);
    if (found === null || found === undefined) {
        return "";
    }
    return String(found);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
