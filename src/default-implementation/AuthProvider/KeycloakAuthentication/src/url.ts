export function stripTrailingSlash(s: string): string {
    return s.replace(/\/+$/, "");
}

export function detectCookieSecure(url: string): boolean {
    try { return new URL(url).protocol === "https:"; } catch { return true; }
}

/**
 * Rejects absolute URLs and anything that doesn't start with `/` to prevent
 * open redirects. Also rejects `//evil.com`-style protocol-relative URLs.
 */
export function sanitizeReturnTo(candidate: string, fallback: string): string {
    if (!candidate) return fallback;
    if (!candidate.startsWith("/")) return fallback;
    if (candidate.startsWith("//")) return fallback;
    return candidate;
}
