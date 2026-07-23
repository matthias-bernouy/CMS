const COOKIE_MAX_AGE_SECONDS = 396 * 86_400;

export function analyticsOptOutCookieName(siteScope: string): string {
    let hash = 2_166_136_261;
    for (const character of siteScope) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16_777_619);
    }
    return `p9r_analytics_opt_out_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function isAnalyticsCollectionAllowed(req: Request, cookieName: string, honorDnt: boolean): boolean {
    if (req.headers.get("sec-gpc")?.trim() === "1") {
        return false;
    }
    if (honorDnt && req.headers.get("dnt")?.trim() === "1") {
        return false;
    }
    return readCookie(req.headers.get("cookie"), cookieName) !== "1";
}

export function analyticsPreferenceCookie(name: string, optedOut: boolean, path: string, secure: boolean): string {
    const parts = [
        `${name}=${optedOut ? "1" : ""}`,
        `Path=${path || "/"}`,
        "HttpOnly",
        "SameSite=Lax",
        optedOut ? `Max-Age=${COOKIE_MAX_AGE_SECONDS}` : "Max-Age=0",
    ];
    if (secure) {
        parts.push("Secure");
    }
    return parts.join("; ");
}

function readCookie(header: string | null, name: string): string | undefined {
    for (const pair of header?.split(";") ?? []) {
        const separator = pair.indexOf("=");
        if (separator < 0) {
            continue;
        }
        if (pair.slice(0, separator).trim() === name) {
            return pair.slice(separator + 1).trim();
        }
    }
    return;
}
