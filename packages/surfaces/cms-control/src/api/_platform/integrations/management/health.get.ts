import type { ControlCms } from "cms-control/ControlCms";
import { managementRequest } from "cms-control/core/management/integrations/installationActions/management/request";
export default async function management(req: Request, cms: ControlCms): Promise<Response> {
    const { id, service, url } = managementRequest(req, cms);
    return Response.json(await service.health(id, url.searchParams.get("refresh") === "true"));
}
