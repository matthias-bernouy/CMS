import type { Authentication, Middleware } from "@bernouy/core";
import { requireRole } from "@bernouy/core";
import type { SuperadminRole } from "src/exports/MtControlCms";

/**
 * Middleware applied to every `/superadmin/*` route. Wraps
 * `requireRole(auth, "superadmin")` with cms-control-mt-specific response
 * shaping:
 * - `/superadmin/api/*` errors → JSON envelope
 * - other `/superadmin/*` errors → 302 to login (unauth) or text 403 (forbidden)
 *
 * CSRF is configured `cookie-only` so the bearer leg of a composite auth
 * (machine-to-machine admin tokens) skips the Origin check while the cookie
 * leg (browser sessions) still enforces it.
 */
export function createSuperadminGuard(auth: Authentication<SuperadminRole>): Middleware {
    return requireRole(auth, "superadmin", {
        csrf: "cookie-only",
        onUnauthenticated: (req, a) => {
            const url = new URL(req.url);
            if (isApi(url)) return jsonError("unauthorized", "Not authenticated.", 401);
            return new Response(null, {
                status:  302,
                headers: { Location: a.buildLoginUrl(url.pathname) },
            });
        },
        onForbidden: (req) => {
            const url = new URL(req.url);
            if (isApi(url)) return jsonError("forbidden", "Superadmin role required.", 403);
            return new Response("Forbidden", { status: 403 });
        },
    });
}

function isApi(url: URL): boolean {
    return url.pathname.startsWith("/superadmin/api/");
}

function jsonError(code: string, message: string, status: number): Response {
    return Response.json({ ok: false, error: { code, message } }, { status });
}
