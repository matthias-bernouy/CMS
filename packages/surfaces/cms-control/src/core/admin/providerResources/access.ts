import type { ControlCms } from "cms-control/ControlCms";
import { requireControlAdministrator } from "cms-control/core/admin/control/adminAccess";

export async function requireProviderResources(request: Request, cms: ControlCms) {
    const subject = await requireControlAdministrator(request, cms);
    const resources = cms.config.providerResources;
    if (!resources) {
        throw Object.assign(new Error("Provider resources are not configured"), { status: 503 });
    }
    if (!(await resources.isAdministrator(subject))) {
        throw Object.assign(new Error("Administrator access required"), { status: 403 });
    }
    return { resources, subject };
}
