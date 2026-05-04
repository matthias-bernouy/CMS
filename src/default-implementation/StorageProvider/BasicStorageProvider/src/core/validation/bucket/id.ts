// 3–63 chars, lowercase alnum + dashes, must start and end with alnum.
// Constrained to a single DNS label so the id is safe as a sub-domain of cdn.bernouy.com.
const BUCKET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export function assertValidBucketId(value: unknown): asserts value is string {
    if (typeof value !== "string") {
        throw new TypeError("Bucket id must be a string.");
    }
    if (!BUCKET_ID_PATTERN.test(value)) {
        throw new Error("Bucket id must be 3–63 chars, lowercase letters / digits / dashes, starting and ending with a letter or digit.");
    }
}
