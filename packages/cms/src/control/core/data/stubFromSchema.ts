import type { JSONSchema } from "./types";

/**
 * Synthesize a tiny placeholder value for a JSON schema. Used when an
 * endpoint has no active mockup so the editor preview still renders
 * something predictable.
 *
 * Walks `properties` for objects, picks `items` for arrays (single-element
 * sample), and falls back to the type's zero value for primitives. `enum`
 * wins when present.
 */
export function stubFromSchema(schema: JSONSchema | null): unknown {
    if (!schema) return null;
    if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

    if (schema.allOf?.length) return stubFromSchema(mergeAllOf(schema.allOf));
    if (schema.anyOf?.length) return stubFromSchema(schema.anyOf[0] ?? null);
    if (schema.oneOf?.length) return stubFromSchema(schema.oneOf[0] ?? null);

    switch (schema.type) {
        case "object": {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(schema.properties ?? {})) out[k] = stubFromSchema(v);
            return out;
        }
        case "array":   return schema.items ? [stubFromSchema(schema.items)] : [];
        case "string":  return "";
        case "integer":
        case "number":  return 0;
        case "boolean": return false;
        case "null":    return null;
        default:        return null;
    }
}

function mergeAllOf(schemas: JSONSchema[]): JSONSchema {
    const out: JSONSchema = { type: "object", properties: {} };
    for (const s of schemas) {
        if (s.properties) out.properties = { ...out.properties, ...s.properties };
        if (s.type)       out.type       = s.type;
    }
    return out;
}
