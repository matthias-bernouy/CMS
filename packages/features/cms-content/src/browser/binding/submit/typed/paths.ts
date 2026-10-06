import type { SerializedFormData, SerializedFormValue } from "../types";

const forbidden = new Set(["__proto__", "constructor", "prototype"]);
const index = /^(0|[1-9]\d*)$/;

export function setTypedPath(
    data: SerializedFormData,
    name: string,
    value: SerializedFormValue,
    assigned: Set<string>,
): void {
    const append = name.endsWith("[]");
    const base = append ? name.slice(0, -2) : name;
    if (!/^[A-Za-z0-9_-]+(?:\[[A-Za-z0-9_-]+\])*$/.test(base)) {
        throw new Error(`Invalid typed form name: ${name}. Use bracket paths.`);
    }
    const parts = base.replaceAll("]", "").split("[");
    if (parts.some((part) => forbidden.has(part) || (index.test(part) && Number(part) > 10000))) {
        throw new Error(`Invalid typed form path: ${name}.`);
    }
    let cursor = data;
    for (let i = 0; i < parts.length; i += 1) {
        const key = parts[i]!;
        const path = parts.slice(0, i + 1).join("/");
        if (Array.isArray(cursor) && !index.test(key)) {
            throw new Error(`Mixed object and array path: ${name}.`);
        }
        if (i === parts.length - 1) {
            if (Object.hasOwn(cursor, key) && (!append || !assigned.has(`${path}[]`))) {
                throw new Error(`Conflicting typed form path: ${name}.`);
            }
            if (append) {
                const items = Object.hasOwn(cursor, key) ? (cursor[key] as SerializedFormValue[]) : [];
                items.push(...(Array.isArray(value) ? value : [value]));
                cursor[key] = items;
                assigned.add(`${path}[]`);
            } else {
                cursor[key] = value;
                assigned.add(path);
            }
            return;
        }
        if (assigned.has(path) || assigned.has(`${path}[]`)) {
            throw new Error(`Conflicting typed form path: ${name}.`);
        }
        const array = index.test(parts[i + 1]!);
        if (!Object.hasOwn(cursor, key)) {
            cursor[key] = array ? [] : Object.create(null);
        }
        const next = cursor[key];
        if (next === null || typeof next !== "object" || Array.isArray(next) !== array) {
            throw new Error(`Conflicting typed form path: ${name}.`);
        }
        cursor = next as SerializedFormData;
    }
}
