import type { ControlCms } from "cms-control/ControlCms";
import { managementRequest } from "cms-control/core/management/integrations/installationActions/management/request";
export default async function management(req: Request, cms: ControlCms): Promise<Response> {
    const { id, service } = managementRequest(req, cms);
    return Response.json(await service.settings(id));
}
