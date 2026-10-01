import { resolveRequestSubject, type Authentication, type Subject } from "@bernouy/cms-auth";
import { createAuthGuard } from "@bernouy/cms-auth/http";
import type { Middleware } from "@bernouy/http-runner";
import type { ControlCms } from "cms-control/ControlCms";

const MEMBER_API_ROUTES = new Set([
    "GET /dashboard-context",
    "GET /dashboard-view",
    "GET /my-dashboards",
    "GET /pats",
    "POST /pats",
    "DELETE /pats",
    "GET /profil",
    "DELETE /profil",
    "POST /profil/password",
]);

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

/** Keeps member self-service and assigned dashboard reads open; every other file-routed API requires an admin. */
export function createControlApiAuthorizationGuard(basePath: string, cms: ControlCms): Middleware {
    return async (request, next) => {
        const pathname = new URL(request.url).pathname;
        const prefix = `${basePath}/api`;
        const route = pathname.startsWith(prefix) ? pathname.slice(prefix.length) || "/" : pathname;
        if (!MEMBER_API_ROUTES.has(`${request.method.toUpperCase()} ${route}`)) {
            await requireControlAdministrator(request, cms);
        }
        return next();
    };
}

/** Resolves the verified request subject and fails closed unless Control grants administrator access. */
export async function requireControlAdministrator(request: Request, cms: ControlCms): Promise<Subject> {
    const subject = await resolveRequestSubject(cms.auth, request).catch(() => null);
    if (!subject) {
        throw Object.assign(new Error("Authentication required"), { status: 401 });
    }
    if (!cms.config.administrator || !(await cms.config.administrator(subject))) {
        throw Object.assign(new Error("Administrator access required"), { status: 403 });
    }
    return subject;
}
