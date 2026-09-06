import { resolveRequestSubject } from "@bernouy/cms-auth";
import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { integrationManagement } from "./service";
export function managementRequest(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }
    return { id, url, service: integrationManagement(cms) };
}

export async function managementActor(req: Request, cms: ControlCms) {
    const subject = await resolveRequestSubject(cms.auth, req);
    return subject ? { id: subject.identifier, role: subject.role } : undefined;
}
