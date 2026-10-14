import type { CmsJsonValue } from "cms-content/blocs/core/markup/bindings";

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_JSON_DEPTH = 64;

export function serializeJsonValue(value: unknown): string {
    const normalized = normalizeJsonValue(value, 0, new Set());
    if (normalized === undefined) {
        throw new TypeError("Synchronized state must be a finite, acyclic JSON value");
    }
    return JSON.stringify(normalized);
}

export function parseJsonValue(value: string): CmsJsonValue {
    return JSON.parse(value) as CmsJsonValue;
}

function normalizeJsonValue(value: unknown, depth: number, ancestors: Set<object>): CmsJsonValue | undefined {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }
    if (!value || typeof value !== "object" || depth >= MAX_JSON_DEPTH || ancestors.has(value)) {
        return undefined;
    }
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype && prototype !== null) {
        return undefined;
    }
    ancestors.add(value);
    try {
        if (array) {
            if (Object.keys(value).length !== value.length) {
                return undefined;
            }
            const items: CmsJsonValue[] = [];
            for (const item of value) {
                const normalized = normalizeJsonValue(item, depth + 1, ancestors);
                if (normalized === undefined) {
                    return undefined;
                }
                items.push(normalized);
            }
            return items;
        }
        const object: Record<string, CmsJsonValue> = {};
        for (const [key, item] of Object.entries(value)) {
            if (FORBIDDEN_KEYS.has(key)) {
                return undefined;
            }
            if (item === undefined) {
                continue;
            }
            const normalized = normalizeJsonValue(item, depth + 1, ancestors);
            if (normalized === undefined) {
                return undefined;
            }
            object[key] = normalized;
        }
        return object;
    } finally {
        ancestors.delete(value);
    }
}
