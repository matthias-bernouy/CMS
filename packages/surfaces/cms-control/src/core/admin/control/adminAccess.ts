import { createAuthGuard, type Authentication } from "@bernouy/cms-auth";
import type { Middleware } from "@bernouy/http-runner";

export function createControlAccessGuard(basePath: string, auth: Authentication): Middleware {
    return createAuthGuard({ basePath, auth });
}

export function createAuthenticatedControlGuard(basePath: string, auth: Authentication): Middleware {
    return createAuthGuard({
        basePath,
        auth,
        onUnauthenticated: (req, context) =>
            new URL(req.url).pathname.startsWith(`${basePath}/api/`)
                ? new Response("Unauthorized", { status: 401 })
                : new Response(null, { status: 302, headers: { Location: context.loginUrl } }),
    });
}

export function createControlStaticAccessGuard(
    basePath: string,
    auth: Authentication,
    canAccessDashboardWorkspace: (req: Request) => Promise<boolean>,
): Middleware {
    const control = createControlAccessGuard(basePath, auth);
    const authenticated = createAuthenticatedControlGuard(basePath, auth);
    return async (req, next) => {
        const path = new URL(req.url).pathname.slice(basePath.length) || "/";
        if (path === "/dashboards" || path.startsWith("/dashboards/")) {
            return await authenticated(req, async () => {
                if (!(await canAccessDashboardWorkspace(req))) {
                    return new Response("Forbidden", { status: 403 });
                }
                return await next();
            });
        }
        return await control(req, next);
    };
}
