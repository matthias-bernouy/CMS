import type { Authentication, Middleware } from "@bernouy/core";
import { requireRole } from "@bernouy/core";

/**
 * Middleware applied to every `/admin/*` route. Wraps `requireRole(auth, "admin")`
 * with cdn-buckets-specific response shaping:
 * - `/admin/api/*` errors → JSON `AdminResponse`-shaped envelope
 * - other `/admin/*` errors → 302 to login (unauth) or text 403 (forbidden)
 *
 * CSRF is configured `cookie-only` so a future composite auth (cookie + bearer)
 * would skip the Origin check on bearer-authenticated requests.
 */
export function createAdminGuard(auth: Authentication): Middleware {
    return requireRole(auth, "admin", {
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
            if (isApi(url)) return jsonError("forbidden", "Admin role required.", 403);
            return new Response("Forbidden", { status: 403 });
        },
    });
}

function isApi(url: URL): boolean {
    return url.pathname.startsWith("/admin/api/");
}

function jsonError(code: string, message: string, status: number): Response {
    return Response.json({ ok: false, error: { code, message } }, { status });
}
