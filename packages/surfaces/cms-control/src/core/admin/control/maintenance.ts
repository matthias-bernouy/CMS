import type { Middleware } from "@bernouy/http-runner";
import type { ControlCms } from "cms-control/ControlCms";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createControlMaintenanceGuard(cms: ControlCms): Middleware {
    return async (request, next) => {
        const service = cms.config.collections;
        const path = new URL(request.url).pathname;
        if (SAFE_METHODS.has(request.method) || path.includes("/api/collections/migration/") || !service?.migrations) {
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
