import { resolveRef } from "../resolveRef";
import type { JSONSchema, ParsedSpec } from "../types";

const MAX_DEPTH = 10;

/**
 * Recursively replace every `$ref` in a schema with its target. Walks
 * `properties`, `items`, and the combinators (`allOf`/`anyOf`/`oneOf`).
 *
 * Cycle and depth handling:
 *  - The current resolution chain is tracked in `seen`. When we'd
 *    re-enter a ref, we leave it unresolved (the `$ref` is preserved
 *    in the output so consumers see a marker).
 *  - A hard depth cap prevents pathological non-cyclic chains from
 *    blowing the stack (`User -> Address -> Country -> ...`).
 */
export function deref(
    schema: JSONSchema,
    spec:   ParsedSpec,
    depth = 0,
    seen  = new Set<string>(),
): JSONSchema {
    if (depth > MAX_DEPTH) return schema;
    if (!schema || typeof schema !== "object") return schema;

    if (typeof schema.$ref === "string") {
        if (seen.has(schema.$ref)) return schema;
        const target = resolveRef(schema.$ref, spec);
        if (!target || typeof target !== "object") return schema;
        const nextSeen = new Set(seen);
        nextSeen.add(schema.$ref);
        return deref(target as JSONSchema, spec, depth + 1, nextSeen);
    }

    const out: JSONSchema = { ...schema };

    if (out.properties) {
        const props: Record<string, JSONSchema> = {};
        for (const [k, v] of Object.entries(out.properties)) {
            props[k] = deref(v, spec, depth + 1, seen);
        }
        out.properties = props;
    }

    if (out.items) out.items = deref(out.items, spec, depth + 1, seen);
    if (out.allOf) out.allOf = out.allOf.map(s => deref(s, spec, depth + 1, seen));
    if (out.anyOf) out.anyOf = out.anyOf.map(s => deref(s, spec, depth + 1, seen));
    if (out.oneOf) out.oneOf = out.oneOf.map(s => deref(s, spec, depth + 1, seen));

    return out;
}
