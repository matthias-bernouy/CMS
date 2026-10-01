import type { ControlCms } from "cms-control/ControlCms";
import { requireControlAdministrator } from "cms-control/core/admin/control/adminAccess";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";

export default async function setUserAdministrator(request: Request, cms: ControlCms): Promise<Response> {
    const subject = await requireControlAdministrator(request, cms);
    const store = cms.config.administrators;
    if (!store) {
        throw Object.assign(new Error("Administrator grants unavailable"), { status: 503 });
    }
    const body = await readJsonBody(request);
    if (
        Object.keys(body).some((key) => !["sub", "enabled"].includes(key)) ||
        typeof body.sub !== "string" ||
        typeof body.enabled !== "boolean"
    ) {
        throw new InvalidParam("body", "User and administrator status required");
    }
    if (!(await cms.users.getBySub(body.sub))) {
        throw new InvalidParam("sub", "Unknown user");
    }
    if (body.sub === subject.identifier && !body.enabled) {
        throw new InvalidParam("sub", "You cannot remove your own administrator access");
    }
    await store.set(body.sub, body.enabled);
    return Response.json({ sub: body.sub, administrator: body.enabled });
}
