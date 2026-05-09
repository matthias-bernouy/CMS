// Slug used as the path segment in /.cms/data/<providerId>/* and as a key
// material for the env-var placeholder name. Lowercase alnum + dashes,
// 1–63 chars, must start with a letter (so the placeholder name remains
// a valid env var fragment after sanitisation).
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

export function assertValidProviderId(value: unknown): asserts value is string {
    if (typeof value !== "string") {
        throw new TypeError("Proxy provider id must be a string.");
    }
    if (!PROVIDER_ID_PATTERN.test(value)) {
        throw new Error("Proxy provider id must be 1–63 chars, lowercase letters / digits / dashes, starting with a letter.");
    }
}
