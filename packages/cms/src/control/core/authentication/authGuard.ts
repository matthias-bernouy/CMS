import type { Middleware } from "@bernouy/core";
import type { ControlCms } from "src/control/ControlCms";

export const createAuthGuard = (cms: ControlCms): Middleware => {
    return async (req, next) => {
        const url = new URL(req.url);

        // CSRF: mutating methods must come from the same origin.
        const method = req.method.toUpperCase();
        if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
            const origin = req.headers.get("origin") || req.headers.get("referer");
            if (origin) {
                try {
                    const oHost = new URL(origin).host;
                    if (oHost !== url.host) {
                        return new Response("CSRF: cross-origin request blocked", { status: 403 });
                    }
                } catch {
                    return new Response("CSRF: invalid origin", { status: 403 });
                }
            }
        }

        // Resolve the subject. ONLY auth resolution is wrapped here — `next()`
        // is called OUTSIDE the catch so a downstream handler error (e.g. an
        // S3 upload failure) bubbles to the runner's 500 instead of being
        // mistaken for an expired session. Swallowing it would 302 the caller
        // to Keycloak, which for a `fetch()` surfaces as an opaque CSP/redirect
        // error and hides the real cause.
        const subject = await cms.auth.getSubject(req).catch((error) => {
            console.debug(error);
            return null;
        });

        if (!subject) {
            const loginUrl = cms.auth.buildLoginUrl(url.pathname);
            return new Response(null, {
                status: 302,
                headers: { "Location": loginUrl }
            });
        }
        if (subject.role !== "admin") {
            return new Response("Forbidden", { status: 403 });
        }

        return await next();
    };
};