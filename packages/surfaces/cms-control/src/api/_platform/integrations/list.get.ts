import type { ControlCms } from "cms-control/ControlCms";
import { listIntegrationDefinitions } from "cms-control/core/management/integrations/definitions";

export default async function getIntegrations(_req: Request, cms: ControlCms) {
    return Response.json(await listIntegrationDefinitions(cms.integrationCatalog));
}
