import type { SerializedFormData, SerializedFormValue } from "./types";

const PATH_NAME = /^[A-Za-z0-9_-]+(?:\[[A-Za-z0-9_-]+\])+$/;
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

export function appendSerializedValue(data: SerializedFormData, name: string, value: FormDataEntryValue): void {
    const explicitArray = name.endsWith("[]");
    const fieldName = explicitArray ? name.slice(0, -2) : name;
    const path = nestedPath(fieldName);
    if (explicitArray && /^[A-Za-z0-9_-]+$/.test(fieldName) && !FORBIDDEN_SEGMENTS.has(fieldName)) {
        appendValue(data, fieldName, value, true);
    } else if (!path || !appendNestedValue(data, path, value, explicitArray)) {
        appendValue(data, name, value);
    }
}

function nestedPath(name: string): string[] | null {
    if (!PATH_NAME.test(name)) {
        return null;
    }
    const path = [
        name.slice(0, name.indexOf("[")),
        ...Array.from(name.matchAll(/\[([^\]]+)\]/g), (match) => match[1]!),
    ];
    return path.some((segment) => FORBIDDEN_SEGMENTS.has(segment)) ? null : path;
}

function appendNestedValue(
    data: SerializedFormData,
    path: string[],
    value: FormDataEntryValue,
    explicitArray: boolean,
): boolean {
    const root = path[0]!;
    const existing = data[root];
    if (existing !== undefined && !isRecord(existing)) {
        return false;
    }
    const target = existing ?? Object.create(null);
    if (existing === undefined) {
        data[root] = target;
    }
    let cursor = target as Record<string, SerializedFormValue>;
    for (const segment of path.slice(1, -1)) {
        const child = cursor[segment];
        if (child !== undefined && !isRecord(child)) {
            return false;
        }
        const next = child ?? Object.create(null);
        cursor[segment] = next;
        cursor = next as Record<string, SerializedFormValue>;
    }
    appendValue(cursor, path.at(-1)!, value, explicitArray);
    return true;
}

function appendValue(
    target: Record<string, SerializedFormValue>,
    key: string,
    value: FormDataEntryValue,
    explicitArray = false,
): void {
    const current = Object.hasOwn(target, key) ? target[key] : undefined;
    if (current === undefined) {
        target[key] = explicitArray ? [value] : value;
    } else if (Array.isArray(current)) {
        current.push(value);
    } else {
        target[key] = [current, value];
    }
}

function isRecord(value: unknown): value is Record<string, SerializedFormValue> {
    return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === null;
}
