import { createAuthGuard, type Authentication } from "@bernouy/cms-auth";
import type { Middleware } from "@bernouy/http-runner";
import { renderForbiddenPage } from "cms-control/core/auth/authPages";
import type { CMS_ROLES } from "types/roles";

const OPERATOR_ROLES = new Set(["support", "finance"]);

/**
 * Control has a broad admin surface, while marketplace operators only need the
 * declarative dashboards and their source actions. This wrapper keeps the
 * existing admin super-role behavior and constrains operator roles before the
 * shared authentication guard admits them.
 */
export function createControlAccessGuard(
    basePath: string,
    auth: Authentication<CMS_ROLES>,
): Middleware {
    const authenticated = createAuthGuard({
        basePath,
        auth,
        requiredRole: "admin",
        allowedRoles: ["support", "finance"],
        onForbidden: (_req, ctx) => renderForbiddenPage(ctx.basePath, ctx.logoutUrl),
    });

    return async (req, next) => {
        const subject = await auth.getSubject(req).catch(() => null);
        if (subject && OPERATOR_ROLES.has(subject.role) && !controlOperatorRequestAllows(req, basePath)) {
            const path = new URL(req.url).pathname;
            if (path.startsWith(`${basePath}/api/`) || path.startsWith(`${basePath}/.cms/`)) {
                return new Response("Forbidden", { status: 403 });
            }
            return renderForbiddenPage(basePath, auth.buildLogoutUrl(`${basePath}/login`));
        }
        return authenticated(req, next);
    };
}

export function controlOperatorRequestAllows(req: Request, basePath: string): boolean {
    const path = new URL(req.url).pathname;
    const method = req.method.toUpperCase();
    const read = method === "GET" || method === "HEAD";

    if (read && path.startsWith(`${basePath}/assets/`)) return true;
    if (read && pathMatchesPrefix(path, `${basePath}/admin/sources`)) return true;
    if (read && pathMatchesPrefix(path, `${basePath}/api/dashboards`)) return true;
    if (read && path === `${basePath}/api/profil`) return true;
    return pathMatchesPrefix(path, `${basePath}/.cms/sources`);
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
    return path === prefix || path.startsWith(`${prefix}/`);
}
