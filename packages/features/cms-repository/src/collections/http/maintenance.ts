import type { Middleware } from "@bernouy/http-runner";
import type { CollectionMigrationService } from "cms-repository/collections/installations/migrations/runtime/CollectionMigrationService";

const AVAILABLE_PREFIXES = ["/login", "/.cms/assets", "/.cms/collections"];
const AVAILABLE_PATHS = new Set(["/favicon.ico", "/.cms/blocset", "/.cms/blocstyles", "/.cms/style"]);
const RECOVERY_CAPABILITIES = new Set([
    "ulvia.cms.installations/get-collection-migration",
    "ulvia.cms.installations/get-operation",
    "ulvia.cms.installations/list-operations",
    "ulvia.cms.installations/get-collection-migration-status",
    "ulvia.cms.installations/resume-collection-migration",
    "ulvia.cms.installations/rollback-collection-migration",
]);

export function createCollectionMaintenanceGuard(options: {
    siteId: string;
    migrations: Pick<CollectionMigrationService, "getActive">;
    basePath: string;
}): Middleware {
    return async (request, next) => {
        const active = await options.migrations.getActive(options.siteId);
        if (!active) {
            return next();
        }
        const path = relativePath(request, options.basePath);
        if (isAvailableDuringMaintenance(path)) {
            return next();
        }
        return Response.json(
            { code: "site_maintenance", migrationId: active.id, status: active.status },
            {
                status: path.startsWith("/.cms/call/") ? 423 : 503,
                headers: { "Retry-After": "60", "Cache-Control": "no-store" },
            },
        );
    };
}

function relativePath(request: Request, basePath: string): string {
    const path = new URL(request.url).pathname;
    return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

function isAvailableDuringMaintenance(path: string): boolean {
    if (
        AVAILABLE_PATHS.has(path) ||
        AVAILABLE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    ) {
        return true;
    }
    const capability = path.startsWith("/.cms/call/") ? path.slice("/.cms/call/".length) : null;
    return capability !== null && RECOVERY_CAPABILITIES.has(capability);
}
