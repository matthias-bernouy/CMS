import type { Subject } from "@bernouy/cms-auth";
import type { DashboardDefinition } from "@bernouy/cms-dashboards";
import type { ControlCms } from "cms-control/ControlCms";
import type { CMS_ROLES } from "types/roles";

export async function accessibleDashboards(
    cms: ControlCms,
    subject: Subject<CMS_ROLES>,
): Promise<DashboardDefinition[]> {
    const dashboards = (await cms.dashboards.getAllDashboards()).filter(
        (dashboard) => dashboard.status === "published",
    );
    if (subject.role === "admin") {
        return dashboards;
    }
    const assigned = new Set(await cms.dashboardAssignments.getDashboardIdsForSubject(subject.identifier));
    return dashboards.filter((dashboard) => assigned.has(dashboard.id));
}

export async function canAccessDashboard(
    cms: Pick<ControlCms, "dashboards" | "dashboardAssignments">,
    subject: Subject<CMS_ROLES>,
    dashboardId: string,
): Promise<boolean> {
    const dashboard = await cms.dashboards.getDashboard(dashboardId);
    if (!dashboard || dashboard.status !== "published") {
        return false;
    }
    return subject.role === "admin" || (await cms.dashboardAssignments.hasAssignment(subject.identifier, dashboardId));
}

export async function canAccessDashboardWorkspace(cms: ControlCms, req: Request): Promise<boolean> {
    const subject = await cms.auth.getSubject(req).catch(() => null);
    return subject ? (await accessibleDashboards(cms, subject)).length > 0 : false;
}
