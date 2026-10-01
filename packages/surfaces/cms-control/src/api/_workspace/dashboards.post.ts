import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { requireDashboardAdmin, dashboardCollections } from "cms-control/core/admin/dashboards/access";
import { dashboardName, newDashboard } from "cms-control/core/admin/dashboards/model";
import { parseDashboardNavigation } from "cms-control/core/admin/dashboards/navigation";

export default async function createDashboard(request: Request, cms: ControlCms): Promise<Response> {
    await requireDashboardAdmin(request, cms);
    const body = await readJsonBody(request);
    if (Object.keys(body).some((key) => !["name", "icon", "navigation"].includes(key))) {
        throw new InvalidParam("body", "Unknown dashboard field");
    }
    const navigation = await parseNavigation(cms, body.navigation);
    const icon = dashboardIcon(body.icon);
    const record = newDashboard(dashboardCollections(cms).siteId, dashboardName(body.name));
    const created = { ...record, icon, navigation };
    await cms.dashboards.create(created);
    return Response.json(created, { status: 201 });
}

async function parseNavigation(cms: ControlCms, value: unknown) {
    try {
        return await parseDashboardNavigation(cms, value);
    } catch (error) {
        throw new InvalidParam("navigation", error instanceof Error ? error.message : "Invalid navigation");
    }
}

function dashboardIcon(value: unknown): string {
    if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(value)) {
        throw new InvalidParam("icon", "Choose a dashboard icon");
    }
    return value;
}
