import type { JSONSchema } from "./types";

/**
 * Normalize a schema into a single-shape view the renderers can consume:
 *  - Merge `allOf` into a single object (shallow union of `properties`,
 *    last-wins on duplicates).
 *  - Surface `nullable: true` as a separate boolean so the primitive /
 *    object / array renderers can offer a "set null" affordance without
 *    duplicating the type-detection logic.
 *  - Leave `oneOf` / `anyOf` alone — the variant renderer handles those.
 *
 * Returns null when the input is null/undefined so callers can fall back
 * to the raw JSON editor.
 */
export type NormalizedSchema = JSONSchema & { nullable?: boolean };

export function normalize(schema: JSONSchema | null | undefined): NormalizedSchema | null {
    if (!schema) return null;
    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
        return mergeAllOf(schema.allOf, schema);
    }
    return schema;
}

function mergeAllOf(parts: JSONSchema[], parent: JSONSchema): NormalizedSchema {
    const out: NormalizedSchema = {
        type:       "object",
        properties: {},
        required:   [],
    };
    const reqSet = new Set<string>();
    for (const p of [...parts, parent]) {
        if (p.type)       out.type       = p.type;
        if (p.format)     out.format     = p.format;
        if (p.nullable)   out.nullable   = true;
        if (p.enum)       out.enum       = p.enum;
        if (p.description && !out.description) out.description = p.description;
        if (p.properties) out.properties = { ...out.properties, ...p.properties };
        if (Array.isArray(p.required)) for (const r of p.required) reqSet.add(r);
    }
    if (reqSet.size > 0) out.required = Array.from(reqSet);
    return out;
}
