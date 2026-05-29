import type { JSONSchema } from "../types";

/**
 * Walk a (dereferenced) schema and emit one entry per leaf path. Object
 * properties join with `.`, arrays with `[]`. Used by the richtextbar
 * autocomplete to expose `{{ user.address.city }}` style bindings.
 *
 * Tolerant by design: missing types, mixed shapes, or unknown keywords
 * just produce no output for that branch — the picker shows what makes
 * sense and ignores the rest.
 */
export function flattenSchema(schema: JSONSchema | undefined, prefix = ""): string[] {
    if (!schema || typeof schema !== "object") return [];

    if (schema.properties) {
        const out: string[] = [];
        for (const [key, sub] of Object.entries(schema.properties)) {
            const next = prefix ? `${prefix}.${key}` : key;
            const inner = flattenSchema(sub, next);
            if (inner.length === 0) out.push(next);
            else out.push(...inner);
        }
        return out;
    }

    if (schema.items) {
        const next = `${prefix}[]`;
        const inner = flattenSchema(schema.items, next);
        return inner.length === 0 ? [next] : inner;
    }

    return prefix ? [prefix] : [];
}
