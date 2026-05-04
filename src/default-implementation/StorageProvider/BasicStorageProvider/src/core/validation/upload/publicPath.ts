// URL-safe segments separated by "/". Each segment matches alphanum, dot, dash,
// underscore. Reserved names "." and ".." are rejected even when they pass the
// character class, to prevent path traversal in the symlink layer.
const SEGMENT = /^[a-zA-Z0-9._-]+$/;

export function assertValidPublicPath(value: unknown): asserts value is string {
    if (typeof value !== "string") {
        throw new TypeError("publicPath must be a string.");
    }
    if (value.length === 0 || value.length > 255) {
        throw new Error(`publicPath length out of range (${value.length}). Must be 1–255 chars.`);
    }
    if (value.startsWith("/") || value.endsWith("/")) {
        throw new Error("publicPath must not start or end with '/'.");
    }
    for (const seg of value.split("/")) {
        if (seg === "" || seg === "." || seg === ".." || !SEGMENT.test(seg)) {
            throw new Error(`Invalid publicPath segment: ${JSON.stringify(seg)}.`);
        }
    }
}
