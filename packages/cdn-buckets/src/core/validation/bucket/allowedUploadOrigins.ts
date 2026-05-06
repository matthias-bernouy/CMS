/**
 * Parses `allowedUploadOrigins` as submitted by the bucket admin form.
 * Accepts either a comma-separated string (`"https://a.com,https://b.com"`),
 * a single string, an array, or empty/missing. Validates each entry is `*`
 * or a full origin (`https?://host[:port]`, no path / no trailing slash).
 */
export function parseAllowedUploadOrigins(value: unknown): string[] {
    let raw: string[] = [];
    if (Array.isArray(value)) raw = value.map(String);
    else if (typeof value === "string") {
        raw = value.split(",").map(s => s.trim()).filter(Boolean);
    }

    const out: string[] = [];
    for (const entry of raw) {
        const e = entry.trim();
        if (!e) continue;
        if (e === "*") { out.push("*"); continue; }
        assertValidOrigin(e);
        out.push(e);
    }
    return out;
}

function assertValidOrigin(s: string): void {
    let url: URL;
    try {
        url = new URL(s);
    } catch {
        throw new TypeError(`invalid origin "${s}": not a URL.`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new TypeError(`invalid origin "${s}": only http/https supported.`);
    }
    if (url.pathname !== "/" && url.pathname !== "") {
        throw new TypeError(`invalid origin "${s}": must not include a path.`);
    }
    if (url.search || url.hash) {
        throw new TypeError(`invalid origin "${s}": must not include query / hash.`);
    }
    // Reject the trailing slash form so storage is canonical and the runtime
    // string-compare against the browser's `Origin` header (which never has
    // trailing slash) is exact.
    if (s.endsWith("/")) {
        throw new TypeError(`invalid origin "${s}": drop the trailing slash.`);
    }
}
