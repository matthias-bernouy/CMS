import type { Middleware } from "@bernouy/http-runner";
import type DeliveryCms from "cms-delivery/DeliveryCms";

export function createDeliveryMaintenanceGuard(delivery: DeliveryCms): Middleware {
    return async (_request, next) => {
        const maintenance = delivery.maintenance;
        const active = maintenance ? await maintenance.migrations.getActive(maintenance.siteId) : null;
        if (!active) {
            return next();
        }
        return Response.json(
            { code: "site_maintenance", migrationId: active.id, status: active.status },
            { status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
        );
    };
}
