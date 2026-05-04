// Shape check only: header grammar is left to Nginx, which will fail at reload
// if the value is malformed. We just guard against empty / oversized / control-char input.
export function assertValidCacheControl(value: unknown): asserts value is string {
    if (typeof value !== "string") {
        throw new TypeError("cacheControl must be a string.");
    }
    if (value.length === 0) {
        throw new Error("cacheControl cannot be empty (use a value like \"no-store\" instead).");
    }
    if (value.length > 200) {
        throw new Error(`cacheControl too long (${value.length}). Max 200.`);
    }
    if (/[\x00-\x1F\x7F]/.test(value)) {
        throw new Error("cacheControl contains control characters.");
    }
}
