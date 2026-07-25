import { IntegrationInputError } from "../../../errors";
import { isRecord, text } from "../../definition/values";

const POSTGRES_TYPE_ALIASES = new Map([
    ["bool", "boolean"],
    ["char", "character"],
    ["decimal", "numeric"],
    ["float4", "real"],
    ["float8", "double precision"],
    ["int", "integer"],
    ["int2", "smallint"],
    ["int4", "integer"],
    ["int8", "bigint"],
    ["varchar", "character varying"],
]);

const PROVIDER_TYPE_PATTERN =
    /^[a-z_][a-z0-9_$]*(?:\.[a-z_][a-z0-9_$]*)?(?:(?: [a-z][a-z0-9_]*)|(?:\((?:-?[0-9]+|[a-z_][a-z0-9_$.]*)(?:,(?:-?[0-9]+|[a-z_][a-z0-9_$.]*))*\)))*(?:\[\])*$/;

export function record(value: unknown, name: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return value;
}

export function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
    const allowedKeys = new Set(allowed);
    const unexpected = Object.keys(value).find((key) => !allowedKeys.has(key));
    if (unexpected) {
        throw new IntegrationInputError(`${name}.${unexpected}`, "is not supported");
    }
}

export function requiredText(value: unknown, name: string): string {
    const parsed = text(value);
    if (!parsed) {
        throw new IntegrationInputError(name, "must be a non-empty string");
    }
    if (parsed.includes("\0")) {
        throw new IntegrationInputError(name, "must not contain NUL characters");
    }
    return parsed;
}

export function requiredBoolean(value: unknown, name: string): boolean {
    if (typeof value !== "boolean") {
        throw new IntegrationInputError(name, "must be boolean");
    }
    return value;
}

export function optionalBoolean(value: unknown, name: string, fallback: boolean): boolean {
    return value === undefined ? fallback : requiredBoolean(value, name);
}

export function array<T>(value: unknown, name: string, parse: (entry: unknown, name: string) => T): T[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => parse(entry, `${name}.${index}`));
}

export function assertUnique(values: readonly string[], name: string, label: string): void {
    const seen = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) {
            throw new IntegrationInputError(name, `contains duplicate ${label} "${value}"`);
        }
        seen.add(value);
    }
}

export function sortByName<T extends { name: string }>(values: T[]): T[] {
    return values.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

export function normalizeProviderType(value: unknown, name: string, provider: string): string {
    let normalized = requiredText(value, name)
        .toLowerCase()
        .replaceAll(/\s+/g, " ")
        .replaceAll(/\s*\(\s*/g, "(")
        .replaceAll(/\s*\)/g, ")")
        .replaceAll(/\s*,\s*/g, ",")
        .replaceAll(/\s*\[\s*\]/g, "[]");
    if (!PROVIDER_TYPE_PATTERN.test(normalized)) {
        throw new IntegrationInputError(name, "must be a normalized provider type");
    }
    if (provider.toLowerCase() === "supabase") {
        normalized = normalizePostgresType(normalized);
    }
    return normalized;
}

function normalizePostgresType(value: string): string {
    const zoned = /^(timestamp|time)(\([^)]*\))? (with|without) time zone((?:\[\])*)$/.exec(value);
    if (zoned) {
        const [, base, precision = "", zone, arrays = ""] = zoned;
        const canonical = zone === "with" ? (base === "timestamp" ? "timestamptz" : "timetz") : base;
        return `${canonical}${precision}${arrays}`;
    }
    const base = /^([a-z][a-z0-9_]*)(.*)$/.exec(value);
    if (!base) {
        return value;
    }
    return `${POSTGRES_TYPE_ALIASES.get(base[1]!) ?? base[1]}${base[2] ?? ""}`;
}
