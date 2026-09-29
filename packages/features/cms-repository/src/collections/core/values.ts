import { invalid } from "./errors";

export type UnknownRecord = Record<string, unknown>;

export function record(value: unknown, path: string): UnknownRecord {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        invalid("must be an object", path);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        invalid("must be a plain object", path);
    }
    return value as UnknownRecord;
}

export function keys(value: UnknownRecord, allowed: readonly string[], path: string): void {
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) {
            invalid(`unknown property ${JSON.stringify(key)}`, `${path}.${key}`);
        }
    }
}

export function array(value: unknown, maximum: number, path: string): unknown[] {
    if (!Array.isArray(value) || value.length > maximum) {
        invalid(`must be an array of at most ${maximum} entries`, path);
    }
    if (Object.keys(value).length !== value.length || Object.keys(value).some((key, i) => key !== String(i))) {
        invalid("must be a dense array without extra properties", path);
    }
    return value;
}

export function string(value: unknown, maximum: number, path: string): string {
    if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
        invalid(`must be a nonempty string of at most ${maximum} characters`, path);
    }
    return value;
}

export function identifier(value: unknown, path: string): string {
    const result = string(value, 96, path);
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(result)) {
        invalid("must be a lowercase identifier", path);
    }
    return result;
}

export function integer(value: unknown, minimum: number, maximum: number, path: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
        invalid(`must be an integer between ${minimum} and ${maximum}`, path);
    }
    return value as number;
}

export function unique(values: readonly string[], path: string): void {
    if (new Set(values).size !== values.length) {
        invalid("must not contain duplicate identifiers", path);
    }
}

export function ordinal(left: string, right: string): number {
    return left === right ? 0 : left < right ? -1 : 1;
}
