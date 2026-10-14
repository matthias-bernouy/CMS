import type { CmsJsonValue } from "cms-content/blocs/core/markup/bindings";

export type StructuredData = Record<string, CmsJsonValue>;

const forbidden = new Set(["__proto__", "constructor", "prototype"]);
const index = /^(0|[1-9]\d*)$/;

/** Assign one bracket path into a JSON object while rejecting ambiguous shapes. */
export function setStructuredPath(
    data: StructuredData,
    name: string,
    value: CmsJsonValue,
    assigned: Set<string>,
): void {
    const append = name.endsWith("[]");
    const base = append ? name.slice(0, -2) : name;
    if (!/^[A-Za-z0-9_-]+(?:\[[A-Za-z0-9_-]+\])*$/.test(base)) {
        throw new Error(`Invalid structured data name: ${name}. Use bracket paths.`);
    }
    const parts = base.replaceAll("]", "").split("[");
    if (parts.some((part) => forbidden.has(part) || (index.test(part) && Number(part) > 10000))) {
        throw new Error(`Invalid structured data path: ${name}.`);
    }
    let cursor: StructuredData | CmsJsonValue[] = data;
    for (let position = 0; position < parts.length; position += 1) {
        const key = parts[position]!;
        const path = parts.slice(0, position + 1).join("/");
        if (Array.isArray(cursor) && !index.test(key)) {
            throw new Error(`Mixed object and array path: ${name}.`);
        }
        const property = Array.isArray(cursor) ? Number(key) : key;
        if (position === parts.length - 1) {
            if (Object.hasOwn(cursor, property) && (!append || !assigned.has(`${path}[]`))) {
                throw new Error(`Conflicting structured data path: ${name}.`);
            }
            if (append) {
                const items = Object.hasOwn(cursor, property) ? (readProperty(cursor, property) as CmsJsonValue[]) : [];
                items.push(...(Array.isArray(value) ? value : [value]));
                writeProperty(cursor, property, items);
                assigned.add(`${path}[]`);
            } else {
                writeProperty(cursor, property, value);
                assigned.add(path);
            }
            return;
        }
        if (assigned.has(path) || assigned.has(`${path}[]`)) {
            throw new Error(`Conflicting structured data path: ${name}.`);
        }
        const array = index.test(parts[position + 1]!);
        if (!Object.hasOwn(cursor, property)) {
            writeProperty(cursor, property, array ? [] : Object.create(null));
        }
        const next = readProperty(cursor, property);
        if (next === null || typeof next !== "object" || Array.isArray(next) !== array) {
            throw new Error(`Conflicting structured data path: ${name}.`);
        }
        cursor = next as StructuredData | CmsJsonValue[];
    }
}

function readProperty(target: StructuredData | CmsJsonValue[], property: string | number): CmsJsonValue {
    return Array.isArray(target) ? target[property as number]! : target[property as string]!;
}

function writeProperty(target: StructuredData | CmsJsonValue[], property: string | number, value: CmsJsonValue): void {
    if (Array.isArray(target)) {
        target[property as number] = value;
    } else {
        target[property as string] = value;
    }
}
