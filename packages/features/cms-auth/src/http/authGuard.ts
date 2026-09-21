import type { Authentication } from "cms-auth/interfaces/Authentication";
import { resolveRequestSubject } from "cms-auth/http/requestSubject";
import type { Middleware } from "@bernouy/http-runner";
import { measureRequestTiming } from "@bernouy/http-runner/observability";

/**
 * What `createAuthGuard` needs from the host runtime. Authorization is resolved
 * by views; this middleware only establishes that a request is authenticated.
 */
export interface AuthGuardContext {
    basePath: string;
    auth: Authentication;
    onUnauthenticated?: (req: Request, ctx: { loginUrl: string }) => Response | Promise<Response>;
}

export const createAuthGuard = (ctx: AuthGuardContext): Middleware => {
    return async (req, next) => {
        const url = new URL(req.url);

        // Public static assets (JS/CSS/fonts) — served without auth so the
        // unguarded login page can load the component bundle + theme tokens.
        // Anchored to `<basePath>/assets/` (a loose `includes` would exempt any
        // guarded path that merely contains "/assets/").
        if (url.pathname.startsWith(`${ctx.basePath}/assets/`)) {
            return next();
        }

        // CSRF: mutating methods must come from the same origin. The host the
        // browser sees lives in the `Host` header (preserved by reverse proxies
        // via `proxy_set_header Host $host`); `req.url`'s host reflects the
        // INTERNAL connection (e.g. `cms:3000`) and would always mismatch.
        const method = req.method.toUpperCase();
        if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
            const origin = req.headers.get("origin") || req.headers.get("referer");
            if (origin) {
                try {
                    const oHost = new URL(origin).host;
                    const reqHost = req.headers.get("host") ?? url.host;
                    if (oHost !== reqHost) {
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
        // to the login page, which for a `fetch()` surfaces as an opaque
        // CSP/redirect error and hides the real cause.
        const subject = await measureRequestTiming(req, "cms_auth", () => resolveRequestSubject(ctx.auth, req)).catch(
            (error) => {
                console.debug(error);
                return null;
            },
        );

        if (!subject) {
            const loginUrl = ctx.auth.buildLoginUrl(url.pathname);
            if (ctx.onUnauthenticated) {
                return ctx.onUnauthenticated(req, { loginUrl });
            }
            return new Response(null, {
                status: 302,
                headers: { "Location": loginUrl },
            });
        }
        return await next();
    };
};
