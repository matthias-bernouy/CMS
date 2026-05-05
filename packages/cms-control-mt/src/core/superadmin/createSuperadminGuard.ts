import type { Authentication, Middleware } from "@bernouy/core";
import type { SuperadminRole } from "src/exports/MtControlCms";

/**
 * Middleware factory for the `/superadmin/*` surface. Mirrors the CMS
 * authGuard: cross-origin write requests are CSRF-rejected, GET pages
 * trigger a redirect to login, and only `role === "superadmin"` may
 * proceed. The auth instance is the platform-level one — disjoint from
 * any per-tenant Keycloak.
 */
export function createSuperadminGuard(auth: Authentication<SuperadminRole>): Middleware {
    return async (req, next) => {
        const url = new URL(req.url);

        const method = req.method.toUpperCase();
        if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
            const origin = req.headers.get("origin") || req.headers.get("referer");
            if (origin) {
                try {
                    const oHost = new URL(origin).host;
                    if (oHost !== url.host) return new Response("CSRF: cross-origin blocked", { status: 403 });
                } catch {
                    return new Response("CSRF: invalid origin", { status: 403 });
                }
            }
        }

        const subject = await auth.getSubject(req);
        if (subject?.role === "superadmin") return next();
        if (subject) return new Response("Forbidden", { status: 403 });

        return new Response(null, {
            status:  302,
            headers: { Location: auth.buildLoginUrl(url.pathname) },
        });
    };
}
