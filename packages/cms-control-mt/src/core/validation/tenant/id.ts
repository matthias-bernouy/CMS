/**
 * Tenant ids double as URL prefixes (`/cms/<id>/...`) and Mongo collection
 * prefixes (`tenant_<id>__pages`). Restrict to lowercase letters, digits
 * and `-` so neither URL encoding nor Mongo namespace rules can bite.
 */
const VALID = /^[a-z][a-z0-9-]{1,63}$/;

const RESERVED = new Set(["api", "auth", "admin", "assets", "static", "superadmin", "_storage"]);

export function assertValidTenantId(value: unknown): asserts value is string {
    if (typeof value !== "string") throw new TypeError("tenant id must be a string.");
    if (!VALID.test(value)) {
        throw new TypeError(
            "tenant id must start with a letter, contain only [a-z0-9-], and be 2-64 chars long.",
        );
    }
    if (RESERVED.has(value)) throw new TypeError(`tenant id "${value}" is reserved.`);
}
