import type { JSONSchema } from "./types";
import { normalize } from "./normalize";

/**
 * Build an initial value for a freshly-mounted schema branch — e.g. a
 * new array item, or a freshly-picked oneOf variant. Mirrors the
 * server-side `stubFromSchema` so the structured editor and the API
 * agree on what "empty for this shape" means.
 *
 * Falls back to `null` for unknown / unsupported types so the renderer
 * can show a placeholder rather than guessing.
 */
export function initFromSchema(schema: JSONSchema | null | undefined): unknown {
    const s = normalize(schema);
    if (!s) return null;
    if (Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0];
    if (s.oneOf?.length) return initFromSchema(s.oneOf[0] ?? null);
    if (s.anyOf?.length) return initFromSchema(s.anyOf[0] ?? null);

    switch (s.type) {
        case "object": {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(s.properties ?? {})) out[k] = initFromSchema(v);
            return out;
        }
        case "array":   return s.items ? [initFromSchema(s.items)] : [];
        case "string":  return "";
        case "integer":
        case "number":  return 0;
        case "boolean": return false;
        case "null":    return null;
        default:        return null;
    }
}
