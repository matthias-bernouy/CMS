/**
 * Remove top-level fields flagged `writeOnly: true` (base.md §11.5). Used
 * before returning a config in `GET /tenant/config` or in any hub-facing
 * representation: the value can be POSTed but is NEVER read back.
 *
 * Shallow — `writeOnly` semantics is a per-field flag at the root of the
 * config object (matches the v1 schema profile, which doesn't standardize
 * nested objects).
 */
export function stripWriteOnly(
    config: Record<string, unknown>,
    schema: Record<string, unknown>,
): Record<string, unknown> {
    const props = (schema["properties"] ?? {}) as Record<string, Record<string, unknown>>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config)) {
        if (!props[k]?.["writeOnly"]) out[k] = v;
    }
    return out;
}
