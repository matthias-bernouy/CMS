/** Minimal, web-standard cookie helpers (no Node APIs) for the auth backends. */

export function readCookie(req: Request, name: string): string | null {
    const header = req.headers.get("cookie");
    if (!header) return null;
    for (const part of header.split(";")) {
        const eq = part.indexOf("=");
        if (eq < 0) continue;
        if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
    }
    return null;
}

export function setCookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
    return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

export function clearCookie(name: string, secure: boolean): string {
    return `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

/** Same-site path only — rejects absolute URLs and protocol-relative `//host`
 *  or `/\host` variants to prevent open redirects after login/logout. */
export function sanitizeReturnTo(value: string | null | undefined, fallback: string): string {
    if (!value || !value.startsWith("/") || /^\/[\/\\]/.test(value)) return fallback;
    return value;
}
