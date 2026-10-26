import type { Middleware } from "@bernouy/http-runner";
import type { SiteUpgradeStorage } from "cms-repository/site-upgrades/interfaces";

const AVAILABLE_PREFIXES = ["/login", "/.cms/assets", "/.cms/collections"];
const AVAILABLE_PATHS = new Set(["/favicon.ico", "/.cms/blocset", "/.cms/blocstyles", "/.cms/style", "/.cms/mcp"]);
const RECOVERY_CAPABILITIES = new Set([
    "ulvia.cms.installations/get-collection-upgrade",
    "ulvia.cms.installations/get-operation",
    "ulvia.cms.installations/list-operations",
    "ulvia.cms.installations/get-site-upgrade-status",
    "ulvia.cms.installations/resume-collection-upgrade",
    "ulvia.cms.installations/get-contract-upgrade",
    "ulvia.cms.installations/resume-contract-upgrade",
]);

export function createCollectionMaintenanceGuard(options: {
    siteId: string;
    upgrades: Pick<SiteUpgradeStorage, "getActive">;
    basePath: string;
}): Middleware {
    return async (request, next) => {
        const active = await options.upgrades.getActive(options.siteId);
        if (!active) {
            return next();
        }
        const path = relativePath(request, options.basePath);
        if (isAvailableDuringMaintenance(path)) {
            return next();
        }
        return Response.json(
            { code: "site_maintenance", upgradeId: active.id, status: active.status },
            {
                status: /^\/\.cms\/(call|query|mutation)\//u.test(path) ? 423 : 503,
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
    const capability = /^\/\.cms\/(?:call|query|mutation)\/(.+)$/u.exec(path)?.[1] ?? null;
    return capability !== null && RECOVERY_CAPABILITIES.has(capability);
}
