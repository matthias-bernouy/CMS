const CATALOGUE_CURSOR = /^[A-Za-z0-9_-]{1,1024}$/u;

export function isRepositoryCatalogueCursor(value: unknown): value is string {
    return typeof value === "string" && CATALOGUE_CURSOR.test(value);
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
