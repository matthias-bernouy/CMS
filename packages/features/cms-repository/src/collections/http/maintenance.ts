import type { Middleware } from "@bernouy/http-runner";
import type { SiteUpgradeStorage } from "cms-repository/site-upgrades/interfaces";

const AVAILABLE_PREFIXES = ["/login", "/_content/assets", "/_content/collections"];
const AVAILABLE_PATHS = new Set([
    "/favicon.ico",
    "/_content/blocset",
    "/_content/blocstyles",
    "/_content/style",
    "/.cms/mcp",
]);
const RECOVERY_CAPABILITIES = new Set([
    "ulvia.cms.installations/get-collection-upgrade",
    "ulvia.cms.installations/get-operation",
    "ulvia.cms.installations/list-operations",
    "ulvia.cms.installations/get-site-upgrade-status",
    "ulvia.cms.installations/resume-collection-upgrade",
    "ulvia.cms.installations/get-contract-upgrade",
    "ulvia.cms.installations/resume-contract-upgrade",
]);

type MaintenanceOptions = { siteId: string; upgrades: Pick<SiteUpgradeStorage, "getActive">; basePath: string };
export function createCollectionMaintenanceGuard(options: MaintenanceOptions): Middleware {
    return async (request, next) => (await collectionMaintenanceResponse(request, options)) ?? next();
}
/** Shared decision for middleware and Provider-hosted public resource resolution. */
export async function collectionMaintenanceResponse(
    request: Request,
    options: MaintenanceOptions,
): Promise<Response | null> {
    const active = await options.upgrades.getActive(options.siteId);
    const path = relativePath(request, options.basePath);
    if (!active || isAvailableDuringMaintenance(path)) {
        return null;
    }
    return Response.json(
        { code: "site_maintenance", upgradeId: active.id, status: active.status },
        {
            status: /^\/\.cms\/(call|query|mutation)\//u.test(path) ? 423 : 503,
            headers: { "Retry-After": "60", "Cache-Control": "no-store" },
        },
    );
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
    const capability = /^\/\.cms\/(?:call|query|mutation)\/(.+)$/u.exec(path)?.[1] ?? null;
    return capability !== null && RECOVERY_CAPABILITIES.has(capability);
}
