/**
 * Walks the top-level `properties` of a tenant config schema once and
 * returns the writable-by map per field (base.md §11.4). Falls back to the
 * root `defaultWritableBy`, then to `["control-plane", "tenant"]`.
 */
export type WritableRole = "control-plane" | "tenant";

export interface WritabilityMap {
    [fieldName: string]: ReadonlyArray<WritableRole>;
}

const DEFAULT_GLOBAL: ReadonlyArray<WritableRole> = ["control-plane", "tenant"];

function asRoleList(v: unknown): ReadonlyArray<WritableRole> | undefined {
    if (!Array.isArray(v)) return undefined;
    const out: WritableRole[] = [];
    for (const x of v) {
        if (x === "control-plane" || x === "tenant") out.push(x);
    }
    return out;
}

export function extractWritability(schema: Record<string, unknown>): WritabilityMap {
    const globalDefault = asRoleList(schema["defaultWritableBy"]) ?? DEFAULT_GLOBAL;
    const props = (schema["properties"] ?? {}) as Record<string, unknown>;
    const out: WritabilityMap = {};
    for (const [name, raw] of Object.entries(props)) {
        const prop = (raw ?? {}) as Record<string, unknown>;
        const perField = asRoleList(prop["x-writable-by"]);
        out[name] = perField ?? globalDefault;
    }
    return out;
}
