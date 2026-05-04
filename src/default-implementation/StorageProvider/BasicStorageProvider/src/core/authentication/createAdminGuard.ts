import type { Middleware } from "../../../../../../interfaces/Runner";
import type { Authentication } from "../../../../../../interfaces/Authentication";

/**
 * Middleware applied to every `/admin/*` route. Two responsibilities:
 * - CSRF: mutating cross-origin requests are dropped before they hit the API.
 * - AuthN/AuthZ: the request's session must resolve to a subject with the
 *   `admin` role; otherwise the response shape depends on the surface —
 *   API endpoints get a JSON `AdminResponse` error, browser navigations get
 *   a 302 to the configured login URL with a returnTo.
 */
export function createAdminGuard(auth: Authentication): Middleware {
    return async (req, next) => {
        const url = new URL(req.url);
        const isApi = url.pathname.startsWith("/admin/api/");

        const method = req.method.toUpperCase();
        if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
            const origin = req.headers.get("origin") || req.headers.get("referer");
            if (origin) {
                try {
                    if (new URL(origin).host !== url.host) {
                        return new Response("CSRF: cross-origin request blocked", { status: 403 });
                    }
                } catch {
                    return new Response("CSRF: invalid origin", { status: 403 });
                }
            }
        }

        const subject = await auth.getSubject(req);

        if (!subject) {
            if (isApi) {
                return Response.json(
                    { ok: false, error: { code: "unauthorized", message: "Not authenticated." } },
                    { status: 401 },
                );
            }
            return new Response(null, {
                status: 302,
                headers: { Location: auth.buildLoginUrl(url.pathname) },
            });
        }

        if (subject.role !== "admin") {
            if (isApi) {
                return Response.json(
                    { ok: false, error: { code: "forbidden", message: "Admin role required." } },
                    { status: 403 },
                );
            }
            return new Response("Forbidden", { status: 403 });
        }

        return await next();
    };
}
