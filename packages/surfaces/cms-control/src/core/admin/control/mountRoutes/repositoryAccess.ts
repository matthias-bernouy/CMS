import { resolveRequestSubject, type Authentication } from "@bernouy/cms-auth";
import type { Middleware } from "@bernouy/http-runner";
import type { CMS_ROLES } from "types/roles";

const REPOSITORY_MANAGEMENT_PATHS = ["/admin/repository", "/api/repository"] as const;

export type RepositoryManagementAccess = Readonly<{
    administratorSubjectIdentifier: string;
}>;

/**
 * Restricts the repository management subtree to one configured CMS
 * administrator. Mount this after the regular Control auth guard: that outer
 * guard owns authentication and the admin-role check, while this guard adds the
 * exact opaque-subject check without using mutable profile data such as email.
 */
export function createRepositoryManagementAccessGuard(
    basePath: string,
    auth: Authentication<CMS_ROLES>,
    access: RepositoryManagementAccess | undefined,
): Middleware {
    return async (request, next) => {
        if (!isRepositoryManagementRequest(request, basePath)) {
            return next();
        }
        if (!access?.administratorSubjectIdentifier) {
            return new Response("Not Found", { status: 404 });
        }

        const subject = await resolveRequestSubject(auth, request).catch(() => null);
        if (!subject || subject.identifier !== access.administratorSubjectIdentifier) {
            return new Response("Forbidden", { status: 403 });
        }
        return next();
    };
}

function isRepositoryManagementRequest(request: Request, basePath: string): boolean {
    const pathname = new URL(request.url).pathname;
    const normalizedBasePath = normalizeBasePath(basePath);
    return REPOSITORY_MANAGEMENT_PATHS.some((path) => pathWithin(pathname, `${normalizedBasePath}${path}`));
}

function normalizeBasePath(basePath: string): string {
    if (!basePath || basePath === "/") {
        return "";
    }
    return `/${basePath.split("/").filter(Boolean).join("/")}`;
}

function pathWithin(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
