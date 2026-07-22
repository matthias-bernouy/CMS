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
