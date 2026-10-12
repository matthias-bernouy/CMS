import type { Middleware } from "@bernouy/http-runner";
import type KernelCms from "cms-kernel/KernelCms";

export function createKernelMaintenanceGuard(kernel: KernelCms): Middleware {
    return async (_request, next) => {
        const collections = kernel.collections;
        const active = collections ? await collections.migrations.getActive(collections.siteId) : null;
        if (!active) {
            return next();
        }
        return Response.json(
            { code: "site_maintenance", migrationId: active.id, status: active.status },
            { status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
        );
    };
}
