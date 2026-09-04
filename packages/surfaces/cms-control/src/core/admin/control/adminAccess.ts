import { createAuthGuard, type Authentication } from "@bernouy/cms-auth";
import type { Middleware } from "@bernouy/http-runner";
import { renderForbiddenPage } from "cms-control/core/admin/auth/authPages";
import type { CMS_ROLES } from "types/roles";

export function createControlAccessGuard(basePath: string, auth: Authentication<CMS_ROLES>): Middleware {
    return createAuthGuard({
        basePath,
        auth,
        requiredRole: "admin",
        onForbidden: (_req, ctx) => renderForbiddenPage(ctx.basePath, ctx.logoutUrl),
    });
}

export function createAuthenticatedControlGuard(basePath: string, auth: Authentication<CMS_ROLES>): Middleware {
    return async (req, next) => {
        const subject = await auth.getSubject(req).catch(() => null);
        if (!subject) {
            if (new URL(req.url).pathname.startsWith(`${basePath}/api/`)) {
                return new Response("Unauthorized", { status: 401 });
            }
            return new Response(null, {
                status: 302,
                headers: { Location: auth.buildLoginUrl(new URL(req.url).pathname) },
            });
        }
        return await createAuthGuard({
            basePath,
            auth,
            requiredRole: subject.role,
            onUnauthenticated: () => new Response("Unauthorized", { status: 401 }),
        })(req, next);
    };
}

export function createControlStaticAccessGuard(
    basePath: string,
    auth: Authentication<CMS_ROLES>,
    canAccessDashboardWorkspace: (req: Request) => Promise<boolean>,
): Middleware {
    const admin = createControlAccessGuard(basePath, auth);
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
        return await admin(req, next);
    };
}
