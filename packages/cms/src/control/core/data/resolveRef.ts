import type { ParsedSpec } from "./types";

/**
 * Resolve a single OpenAPI `$ref` into the value it points to within
 * the given spec. Supports local refs only (`#/...`) — external `$ref`
 * URIs return null. The caller decides whether to recurse into a
 * resolved value that itself carries a `$ref`; cycle detection is the
 * caller's job (typically a depth counter at projection time).
 *
 * Implements RFC 6901 JSON pointer escaping: `~1` → `/`, `~0` → `~`.
 */
export function resolveRef(ref: string, spec: ParsedSpec): unknown {
    if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
    if (ref === "#/") return spec;

    const parts = ref.slice(2).split("/").map(unescapePointer);

    let curr: unknown = spec as unknown;
    for (const part of parts) {
        if (curr === null || typeof curr !== "object") return null;
        curr = (curr as Record<string, unknown>)[part];
        if (curr === undefined) return null;
    }
    return curr;
}

function unescapePointer(token: string): string {
    return token.replace(/~1/g, "/").replace(/~0/g, "~");
}
