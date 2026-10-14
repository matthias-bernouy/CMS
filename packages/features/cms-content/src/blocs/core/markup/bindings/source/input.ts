import type {
    CmsBindingInputCast,
    CmsBindingInputMap,
    CmsBindingInputPath,
    CmsBindingInputValue,
    CmsJsonValue,
    CmsSourceBodyBinding,
} from "cms-content/blocs/core/markup/bindings/types";
import { asSyncTarget, parseSyncTarget } from "cms-content/blocs/core/markup/bindings/sync";

const INPUT_CASTS = new Set(["string", "number", "integer", "boolean"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_JSON_DEPTH = 64;
const MAX_PATH_DEPTH = 24;
const MAX_ARRAY_INDEX = 10_000;

export function asSourceBody(body: CmsSourceBodyBinding): string {
    const normalized = normalizeInputMap(body);
    return Object.keys(normalized).length ? JSON.stringify(normalized) : "";
}

export function parseSourceBody(value: string | null | undefined): CmsSourceBodyBinding | null {
    const raw = value?.trim() ?? "";
    if (!raw) {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed)) {
        return null;
    }
    const body: CmsSourceBodyBinding = {};
    for (const [name, source] of Object.entries(parsed)) {
        const normalized = normalizeInputValue(source);
        if (!name.trim() || !normalized) {
            return null;
        }
        body[name] = normalized;
    }
    return Object.keys(body).length ? body : null;
}

function normalizeInputMap(params: CmsBindingInputMap): Record<string, CmsBindingInputValue> {
    const normalized: Record<string, CmsBindingInputValue> = {};
    for (const [name, value] of Object.entries(params)) {
        if (value === null || value === undefined) {
            continue;
        }
        const input = normalizeInputValue(value);
        if (!name.trim() || !input) {
            throw new TypeError(`Invalid CMS binding input field: ${name || "<empty>"}`);
        }
        normalized[name] = input;
    }
    return normalized;
}

function normalizeInputValue(value: unknown): CmsBindingInputValue | null {
    if (!isRecord(value) || typeof value.from !== "string") {
        return null;
    }
    if (value.from === "state") {
        return normalizeStateInput(value);
    }
    if (value.from !== "literal" || !hasOnlyKeys(value, ["from", "value"]) || !Object.hasOwn(value, "value")) {
        return null;
    }
    const literal = cloneJsonValue(value.value, 0, new Set());
    return literal === undefined ? null : { from: "literal", value: literal };
}

function normalizeStateInput(value: Record<string, unknown>): CmsBindingInputValue | null {
    if (!hasOnlyKeys(value, ["from", "key", "path", "cast", "optional", "fallback"])) {
        return null;
    }
    const target = typeof value.key === "string" ? parseSyncTarget(value.key) : null;
    const path = value.path === undefined ? undefined : normalizeInputPath(value.path);
    const cast = value.cast === undefined ? undefined : String(value.cast);
    const optional = value.optional === undefined ? undefined : value.optional;
    const hasFallback = Object.hasOwn(value, "fallback");
    const fallback = hasFallback ? cloneJsonValue(value.fallback, 0, new Set()) : undefined;
    if (
        !target ||
        (value.path !== undefined && !path) ||
        (cast !== undefined && !INPUT_CASTS.has(cast)) ||
        (optional !== undefined && typeof optional !== "boolean") ||
        (optional === true && hasFallback) ||
        (hasFallback && fallback === undefined)
    ) {
        return null;
    }
    return {
        from: "state",
        key: asSyncTarget(target),
        ...(path ? { path } : {}),
        ...(cast ? { cast: cast as CmsBindingInputCast } : {}),
        ...(optional === undefined ? {} : { optional }),
        ...(hasFallback ? { fallback: fallback! } : {}),
    };
}

function normalizeInputPath(value: unknown): CmsBindingInputPath | null {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PATH_DEPTH) {
        return null;
    }
    const path: Array<string | number> = [];
    for (const segment of value) {
        if (typeof segment === "string" && segment.length > 0 && !FORBIDDEN_KEYS.has(segment)) {
            path.push(segment);
        } else if (
            typeof segment === "number" &&
            Number.isSafeInteger(segment) &&
            segment >= 0 &&
            segment <= MAX_ARRAY_INDEX
        ) {
            path.push(segment);
        } else {
            return null;
        }
    }
    return path;
}

function cloneJsonValue(value: unknown, depth: number, ancestors: Set<object>): CmsJsonValue | undefined {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }
    if (!value || typeof value !== "object" || depth >= MAX_JSON_DEPTH || ancestors.has(value)) {
        return undefined;
    }
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
        return undefined;
    }
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            if (Object.keys(value).length !== value.length) {
                return undefined;
            }
            const items = value.map((item) => cloneJsonValue(item, depth + 1, ancestors));
            return items.includes(undefined) ? undefined : (items as CmsJsonValue[]);
        }
        const object: Record<string, CmsJsonValue> = {};
        for (const [key, item] of Object.entries(value)) {
            const cloned = cloneJsonValue(item, depth + 1, ancestors);
            if (FORBIDDEN_KEYS.has(key) || item === undefined || cloned === undefined) {
                return undefined;
            }
            object[key] = cloned;
        }
        return object;
    } finally {
        ancestors.delete(value);
    }
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
    const accepted = new Set(allowed);
    return Object.keys(value).every((key) => accepted.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
