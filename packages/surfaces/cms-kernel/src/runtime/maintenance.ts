import type { Middleware } from "@bernouy/http-runner";
import type KernelCms from "cms-kernel/KernelCms";

/** Routes that remain available while a collection migration fences content. */
const AVAILABLE_PREFIXES = ["/login", "/.cms/auth", "/.cms/public-auth", "/.cms/assets", "/.cms/collections"];
const AVAILABLE_PATHS = new Set(["/favicon.ico", "/.cms/assets/favicon", "/.cms/bloc", "/.cms/blocset", "/.cms/style"]);
const RECOVERY_CAPABILITIES = new Set([
    "ulvia.cms.collections/get-migration",
    "ulvia.cms.collections/migration-status",
    "ulvia.cms.collections/resume-migration",
    "ulvia.cms.collections/rollback-migration",
    "ulvia.cms.jobs/get",
    "ulvia.cms.jobs/list",
]);

export function createKernelMaintenanceGuard(kernel: KernelCms): Middleware {
    return async (request, next) => {
        const collections = kernel.collections;
        const active = collections ? await collections.migrations.getActive(collections.siteId) : null;
        if (!active) {
            return next();
        }
        const path = kernelPath(request, kernel.basePath);
        if (isAvailableDuringMaintenance(path)) {
            return next();
        }
        const status = path.startsWith("/.cms/call/") ? 423 : 503;
        return Response.json(
            { code: "site_maintenance", migrationId: active.id, status: active.status },
            { status, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
        );
    };
}

function kernelPath(request: Request, basePath: string): string {
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
