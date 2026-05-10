/**
 * Hand-rolled parsing primitives. No zod dependency — the surface is
 * small enough that explicit validators read better than schemas, and
 * each `require*` keeps the JSON-pointer-like `path` for clear errors.
 */
export class ProxyRulesParseError extends Error {
    constructor(public readonly path: string, message: string) {
        super(`${path}: ${message}`);
        this.name = "ProxyRulesParseError";
    }
}

export function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function requireObject(v: unknown, path: string): Record<string, unknown> {
    if (!isObject(v)) throw new ProxyRulesParseError(path, "must be an object");
    return v;
}

export function requireArray(v: unknown, path: string): unknown[] {
    if (!Array.isArray(v)) throw new ProxyRulesParseError(path, "must be an array");
    return v;
}

export function requireString(v: unknown, path: string): string {
    if (typeof v !== "string" || v.length === 0) {
        throw new ProxyRulesParseError(path, "must be a non-empty string");
    }
    return v;
}

export function optionalString(v: unknown, path: string): string | undefined {
    if (v === undefined) return undefined;
    if (typeof v !== "string") throw new ProxyRulesParseError(path, "must be a string");
    return v;
}

export function requireNumber(v: unknown, path: string): number {
    if (typeof v !== "number" || !Number.isFinite(v)) {
        throw new ProxyRulesParseError(path, "must be a finite number");
    }
    return v;
}

export function optionalNumber(v: unknown, path: string): number | undefined {
    if (v === undefined) return undefined;
    return requireNumber(v, path);
}

export function optionalBoolean(v: unknown, path: string): boolean | undefined {
    if (v === undefined) return undefined;
    if (typeof v !== "boolean") throw new ProxyRulesParseError(path, "must be a boolean");
    return v;
}

export function requireOneOf<T extends string>(v: unknown, path: string, allowed: readonly T[]): T {
    const s = requireString(v, path);
    if (!(allowed as readonly string[]).includes(s)) {
        throw new ProxyRulesParseError(path, `must be one of ${allowed.join(", ")}`);
    }
    return s as T;
}

export function requireStringArray(v: unknown, path: string): string[] {
    const arr = requireArray(v, path);
    return arr.map((item, i) => requireString(item, `${path}[${i}]`));
}
