import type { ControlCms } from "cms-control/ControlCms";
import {
    managementRequest,
    managementActor,
} from "cms-control/core/management/integrations/installationActions/management/request";
import { readInstallationActionBody } from "cms-control/core/management/integrations/installationActions";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
export default async function management(req: Request, cms: ControlCms): Promise<Response> {
    const { id, service } = managementRequest(req, cms);
    const body = await readInstallationActionBody(req);
    if (
        typeof body.actionId !== "string" ||
        (body.input !== undefined && (!body.input || typeof body.input !== "object" || Array.isArray(body.input)))
    ) {
        throw new InvalidParam("actionId", "Declared action id and object input expected.");
    }
    return Response.json(
        await service.action(
            id,
            body.actionId,
            body.input as Record<string, unknown> | undefined,
            await managementActor(req, cms),
        ),
    );
}
