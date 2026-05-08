import type { Authentication, DefaultRole } from "../interfaces/Authentication";
import type { Middleware } from "../interfaces/Runner";

export type RequireRoleOptions<Role extends string = DefaultRole> = {
    /**
     * CSRF policy for mutating methods (POST/PUT/PATCH/DELETE).
     *  - `"off"` (default): never check Origin/Referer. Safe for bearer-only
     *    surfaces — browsers do not auto-attach `Authorization` cross-origin.
     *  - `"cookie-only"`: skip the check when an `Authorization` header is
     *    present (i.e. the request authenticated via bearer), enforce it
     *    otherwise. Use this on routes guarded by a composite that accepts
     *    both cookie sessions and bearer tokens.
     *  - `"always"`: enforce on every mutating request, even bearer ones.
     */
    csrf?: "off" | "cookie-only" | "always";
    /**
     * Response when no Subject is resolved. Default = JSON 401. Override to
     * redirect HTML navigations to a login page, etc.
     */
    onUnauthenticated?: (req: Request, auth: Authentication<Role>) => Response;
    /**
     * Response when the Subject is present but the role does not match.
     * Default = JSON 403.
     */
    onForbidden?: (req: Request, auth: Authentication<Role>) => Response;
};

/**
 * Middleware: enforces that the request resolves to a `Subject` whose `role`
 * equals the required value. Centralises the auth-check pattern that
 * package-level admin/broker guards used to reimplement themselves.
 */
export function requireRole<Role extends string = DefaultRole>(
    auth: Authentication<Role>,
    role: Role,
    options: RequireRoleOptions<Role> = {},
): Middleware {
    const csrf              = options.csrf              ?? "off";
    const onUnauthenticated = options.onUnauthenticated ?? defaultOnUnauthenticated;
    const onForbidden       = options.onForbidden       ?? defaultOnForbidden;

    return async (req, next) => {
        if (csrf !== "off" && isMutating(req.method)) {
            const skip = csrf === "cookie-only" && req.headers.get("authorization") !== null;
            if (!skip) {
                const csrfReject = checkCsrf(req);
                if (csrfReject) return csrfReject;
            }
        }

        const subject = await auth.getSubject(req);
        if (!subject)              return onUnauthenticated(req, auth);
        if (subject.role !== role) return onForbidden(req, auth);

        return next();
    };
}

function isMutating(method: string): boolean {
    const m = method.toUpperCase();
    return m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
}

// Lenient: missing Origin/Referer is acceptable (some legitimate non-browser
// clients omit them). Only reject when present AND cross-origin — that is the
// case the browser-vs-cookie attack vector requires.
function checkCsrf(req: Request): Response | null {
    const origin = req.headers.get("origin") || req.headers.get("referer");
    if (!origin) return null;
    let originHost: string;
    try { originHost = new URL(origin).host; }
    catch { return new Response("CSRF: invalid origin", { status: 403 }); }
    const reqHost = new URL(req.url).host;
    if (originHost !== reqHost) return new Response("CSRF: cross-origin request blocked", { status: 403 });
    return null;
}

function defaultOnUnauthenticated(): Response {
    return Response.json(
        { ok: false, error: { code: "unauthenticated", message: "Authentication required." } },
        { status: 401 },
    );
}

function defaultOnForbidden(): Response {
    return Response.json(
        { ok: false, error: { code: "forbidden", message: "Insufficient permissions." } },
        { status: 403 },
    );
}
