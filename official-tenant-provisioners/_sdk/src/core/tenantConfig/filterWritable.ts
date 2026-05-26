import { PlaneError } from "src/core/errors";
import { extractWritability, type WritabilityMap } from "src/core/tenantConfig/extractWritability";

/**
 * Provider-side guard for `PATCH /tenant/config` (base.md §11.4). Walks the
 * incoming body's keys; if any field is NOT in the schema or not writable
 * by `tenant`, throws `PlaneError` → 403, mapped to RFC 7807. The provider
 * MUST call this **before** running the zod parse; otherwise an attacker
 * can hide hub-only fields behind a valid shape.
 */
export function assertTenantWritable(
    schema: Record<string, unknown>,
    body: Record<string, unknown>,
): void {
    const writability: WritabilityMap = extractWritability(schema);
    for (const key of Object.keys(body)) {
        const allowed = writability[key];
        if (!allowed) {
            throw new PlaneError(`unknown config field "${key}"`);
        }
        if (!allowed.includes("tenant")) {
            throw new PlaneError(`field "${key}" not writable by tenant`);
        }
    }
}

export { extractWritability };
