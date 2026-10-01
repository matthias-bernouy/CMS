import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { requireProviderManagement } from "cms-control/core/admin/providerResources/management";

export default async function approveProvider(request: Request, cms: ControlCms): Promise<Response> {
    const { management, actorId } = await requireProviderManagement(request, cms);
    const body = await readJsonBody(request);
    if (Object.keys(body).length !== 1 || typeof body.ticket !== "string") {
        throw new InvalidParam("body", "Installation preview ticket expected");
    }
    return Response.json(await management.approve(body.ticket, actorId), { status: 201 });
}
