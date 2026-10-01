import { resolveRequestSubject } from "@bernouy/cms-auth";
import type { ControlCms } from "cms-control/ControlCms";
import type { DashboardRecord } from "@bernouy/cms-dashboards";
import { requireControlAdministrator } from "cms-control/core/admin/control/adminAccess";

export async function dashboardSubject(request: Request, cms: ControlCms) {
    const subject = await resolveRequestSubject(cms.auth, request).catch(() => null);
    if (!subject) {
        throw Object.assign(new Error("Authentication required"), { status: 401 });
    }
    return subject;
}

export async function requireDashboardAdmin(request: Request, cms: ControlCms) {
    return requireControlAdministrator(request, cms);
}

export function dashboardCollections(cms: ControlCms) {
    const collections = cms.config.collections;
    if (!collections) {
        throw Object.assign(new Error("Collection workspace is not configured"), { status: 503 });
    }
    return collections;
}

export function canReadDashboard(record: DashboardRecord, administrator: boolean, assigned: boolean): boolean {
    return (record.enabled || administrator) && (administrator || assigned);
}
