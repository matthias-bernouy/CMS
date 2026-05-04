// Concrete type, with subtype either concrete or `*`. Excludes `*/*` and bare `*`,
// which would defeat the point of a per-bucket whitelist (use the `"*"` literal at
// the bucket level instead).
const MIME_PATTERN = /^[a-z0-9.+-]+\/(?:\*|[a-z0-9.+-]+)$/i;

export function isMimePattern(value: unknown): value is string {
    return typeof value === "string" && MIME_PATTERN.test(value);
}

export function assertValidMimeType(value: unknown): asserts value is string {
    if (!isMimePattern(value)) {
        throw new Error("Invalid MIME type. Expected `type/subtype`, e.g. `image/png` or `image/*`.");
    }
}

/** Returns true if `mimeType` matches any of the patterns in `accepted`. */
export function mimeMatches(mimeType: string, accepted: string[] | "*"): boolean {
    if (accepted === "*") return true;
    const [type, subtype] = mimeType.toLowerCase().split("/");
    if (!type || !subtype) return false;
    for (const pattern of accepted) {
        const [pType, pSubtype] = pattern.toLowerCase().split("/");
        if (pType !== type) continue;
        if (pSubtype === "*" || pSubtype === subtype) return true;
    }
    return false;
}
