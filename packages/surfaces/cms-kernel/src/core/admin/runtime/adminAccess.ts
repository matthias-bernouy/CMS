import { resolveRequestSubject, type Authentication, type Subject } from "@bernouy/cms-auth";
import { createAuthGuard } from "@bernouy/cms-auth/http";
import type { Middleware } from "@bernouy/http-runner";
import type { KernelCmsOptions } from "cms-kernel/core/admin/runtime/types";

export function createAdminAccessGuard(basePath: string, auth: Authentication): Middleware {
    return createAuthGuard({ basePath, auth });
}

export function createAuthenticatedAdminGuard(basePath: string, auth: Authentication): Middleware {
    return createAuthGuard({
        basePath,
        auth,
        onUnauthenticated: (req, context) =>
            isMachineRoute(new URL(req.url).pathname, basePath)
                ? new Response("Unauthorized", { status: 401 })
                : new Response(null, { status: 302, headers: { Location: context.loginUrl } }),
    });
}

function isMachineRoute(pathname: string, basePath: string): boolean {
    return pathname.startsWith(`${basePath}/.cms/`);
}

/** Protects kernel-owned binary mutations that do not pass through a capability plan. */
export function createAdminAdministratorGuard(
    auth: Authentication,
    administrator: KernelCmsOptions["administrator"],
): Middleware {
    return async (request, next) => {
        await requireAdminAdministrator(request, auth, administrator);
        return next();
    };
}

/** Resolves the verified request subject and fails closed unless Admin grants administrator access. */
async function requireAdminAdministrator(
    request: Request,
    auth: Authentication,
    administrator: KernelCmsOptions["administrator"],
): Promise<Subject> {
    const subject = await resolveRequestSubject(auth, request).catch(() => null);
    if (!subject) {
        throw Object.assign(new Error("Authentication required"), { status: 401 });
    }
    if (!administrator || !(await administrator(subject))) {
        throw Object.assign(new Error("Administrator access required"), { status: 403 });
    }
    return subject;
}
