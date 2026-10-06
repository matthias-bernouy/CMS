import type { Middleware } from "@bernouy/http-runner";
import type { ControlCmsOptions } from "cms-control/core/admin/control/types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const RECOVERY_CAPABILITIES = [
    "/.cms/call/ulvia.cms.collections/get-migration",
    "/.cms/call/ulvia.cms.collections/resume-migration",
    "/.cms/call/ulvia.cms.collections/rollback-migration",
    "/.cms/call/ulvia.cms.operations/get",
    "/.cms/call/ulvia.cms.operations/list",
];

export function createControlMaintenanceGuard(service: ControlCmsOptions["collections"]): Middleware {
    return async (request, next) => {
        const path = new URL(request.url).pathname;
        if (
            SAFE_METHODS.has(request.method) ||
            RECOVERY_CAPABILITIES.some((suffix) => path.endsWith(suffix)) ||
            !service?.migrations
        ) {
            return next();
        }
        const active = await service.migrations.getActive(service.siteId);
        if (!active) {
            return next();
        }
        return Response.json(
            { code: "site_maintenance", migrationId: active.id, status: active.status },
            { status: 423, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
        );
    };
}
