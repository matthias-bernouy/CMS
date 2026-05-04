export const FLIGHT_COOKIE = "be5-oidc-flight";
export const POST_LOGOUT_COOKIE = "be5-oidc-post-logout";

/**
 * Builds the three OIDC-related cookies (session, flight, post-logout) with
 * consistent attributes (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` if
 * configured).
 */
export class CookieFactory {
    constructor(
        readonly sessionName: string,
        private readonly _secure: boolean,
    ) {}

    session(value: string, maxAgeSeconds: number): string {
        return this._build(this.sessionName, value, maxAgeSeconds);
    }

    clearSession(): string {
        return this._build(this.sessionName, "", 0);
    }

    flight(value: string, maxAgeSeconds: number): string {
        return this._build(FLIGHT_COOKIE, value, maxAgeSeconds);
    }

    postLogout(value: string, maxAgeSeconds: number): string {
        return this._build(POST_LOGOUT_COOKIE, value, maxAgeSeconds);
    }

    private _build(name: string, value: string, maxAgeSeconds: number): string {
        const secure = this._secure ? " Secure;" : "";
        return `${name}=${value}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
    }
}

export function readCookie(req: Request, name: string): string | null {
    const header = req.headers.get("cookie");
    if (!header) return null;
    const prefix = `${name}=`;
    return header
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(prefix))
        ?.slice(prefix.length) ?? null;
}
