import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { requireDashboardAdmin, dashboardCollections } from "cms-control/core/admin/dashboards/access";
import { dashboardName } from "cms-control/core/admin/dashboards/model";
import { dashboardFromCatalog } from "cms-control/core/admin/dashboards/catalog";
import { parseDashboardNavigation } from "cms-control/core/admin/dashboards/navigation";
import { activateDashboardViewExecutions } from "cms-control/core/admin/dashboards/requirements";

export default async function updateDashboard(request: Request, cms: ControlCms): Promise<Response> {
    await requireDashboardAdmin(request, cms);
    const body = await readJsonBody(request);
    if (
        Object.keys(body).some((key) => !["id", "revision", "name", "icon", "enabled", "navigation"].includes(key)) ||
        typeof body.id !== "string" ||
        !Number.isSafeInteger(body.revision) ||
        typeof body.enabled !== "boolean"
    ) {
        throw new InvalidParam("body", "Invalid dashboard update");
    }
    const siteId = dashboardCollections(cms).siteId;
    const current = await dashboardFromCatalog(cms, body.id);
    if (!current) {
        throw Object.assign(new Error("Dashboard not found"), { status: 404 });
    }
    const revision = body.revision as number;
    if (current.revision !== revision) {
        throw Object.assign(new Error("Dashboard changed; reload before saving"), { status: 409 });
    }
    if (current.origin?.kind === "collection") {
        if (Object.keys(body).some((key) => !["id", "revision", "enabled"].includes(key))) {
            throw new InvalidParam("body", "Collection dashboard content is managed by its collection");
        }
        const { sourceContracts, ...stored } = current;
        const next = { ...stored, enabled: body.enabled, revision: revision + 1 };
        if (next.enabled) {
            await activateExecutions(cms, next.navigation);
        }
        if (revision === 0) {
            await cms.dashboards.create(next);
        } else if (!(await cms.dashboards.replace(next, revision))) {
            throw Object.assign(new Error("Dashboard changed; reload before saving"), { status: 409 });
        }
        return Response.json({ ...next, sourceContracts });
    }
    let navigation;
    try {
        navigation = await parseDashboardNavigation(cms, body.navigation);
    } catch (error) {
        throw new InvalidParam("navigation", error instanceof Error ? error.message : "Invalid navigation");
    }
    if (body.enabled && navigation.length === 0) {
        throw new InvalidParam("navigation", "Add a view before activating this dashboard");
    }
    if (typeof body.icon !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(body.icon)) {
        throw new InvalidParam("icon", "Choose a dashboard icon");
    }
    const { sourceContracts, ...stored } = current;
    const next = {
        ...stored,
        name: dashboardName(body.name),
        icon: body.icon,
        enabled: body.enabled,
        navigation,
        revision: revision + 1,
    };
    if (next.enabled) {
        await activateExecutions(cms, next.navigation);
    }
    if (!(await cms.dashboards.replace(next, revision))) {
        throw Object.assign(new Error("Dashboard changed; reload before saving"), { status: 409 });
    }
    return Response.json({ ...next, sourceContracts });
}

async function activateExecutions(
    cms: ControlCms,
    navigation: Parameters<typeof activateDashboardViewExecutions>[1],
): Promise<void> {
    try {
        await activateDashboardViewExecutions(cms, navigation);
    } catch (error) {
        throw Object.assign(
            new Error(
                `Dashboard execution plan is unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
            ),
            { status: 409 },
        );
    }
}
