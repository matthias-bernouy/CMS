import type { JSONSchema } from "cms-control/core/data/types";

/** Result of walking a JSON schema for scalar-addressable paths. */
export type ScalarField = { path: string; label: string; type: string };

/**
 * Flatten a JSON schema into the list of scalar fields a consumer can
 * read or condition on. Recurses into objects, surfaces a virtual
 * `<path>.length` for arrays (so size-based conditions stay in the
 * scalar world), skips array items (those belong to iteration), and
 * picks the first variant of `oneOf`/`anyOf`.
 *
 * Empty `path` is emitted when the root schema itself is a primitive —
 * caller decides whether to keep that "value-as-source" entry or drop
 * it.
 */
export function flattenScalars(schema: JSONSchema | null | undefined, prefix = ""): ScalarField[] {
    const s = unwrap(schema);
    if (!s) return [];

    if (Array.isArray(s.enum) && s.enum.length > 0) {
        return [{ path: prefix, label: leafLabel(prefix), type: enumTypeOf(s) }];
    }

    switch (s.type) {
        case "object": {
            const out: ScalarField[] = [];
            for (const [k, v] of Object.entries(s.properties ?? {})) {
                out.push(...flattenScalars(v, prefix ? `${prefix}.${k}` : k));
            }
            return out;
        }
        case "array":
            return [{
                path:  prefix ? `${prefix}.length` : "length",
                label: "length",
                type:  "integer",
            }];
        case "string":
        case "integer":
        case "number":
        case "boolean":
        case "null":
            return [{ path: prefix, label: leafLabel(prefix), type: s.type }];
        default:
            return [];
    }
}

function unwrap(schema: JSONSchema | null | undefined): JSONSchema | null {
    if (!schema) return null;
    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
        const merged: JSONSchema = { type: "object", properties: {} };
        for (const part of schema.allOf) {
            if (part.type)       merged.type       = part.type;
            if (part.properties) merged.properties = { ...merged.properties, ...part.properties };
        }
        return merged;
    }
    if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) return schema.oneOf[0] ?? null;
    if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) return schema.anyOf[0] ?? null;
    return schema;
}

function leafLabel(path: string): string {
    if (!path) return "value";
    const dot = path.lastIndexOf(".");
    return dot >= 0 ? path.slice(dot + 1) : path;
}

function enumTypeOf(s: JSONSchema): string {
    if (s.type) return s.type;
    const first = s.enum?.[0];
    return typeof first === "string"  ? "string"
        :  typeof first === "number"  ? "number"
        :  typeof first === "boolean" ? "boolean"
        :  "string";
}
