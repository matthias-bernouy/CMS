import type { ControlCms } from "cms-control/ControlCms";
import { requireProviderResources } from "./access";

export async function requireProviderManagement(request: Request, cms: ControlCms) {
    const { resources, subject } = await requireProviderResources(request, cms);
    if (!resources.management) {
        throw Object.assign(new Error("Provider management is not configured"), { status: 503 });
    }
    return { management: resources.management, actorId: subject.identifier };
}
