import type { ControlCms } from "cms-control/ControlCms";
import { integrationRegistry } from "@bernouy/cms-integrations";

export default async function getIntegrations(_req: Request, cms: ControlCms) {
    return Response.json(integrationRegistry(cms.integrations));
}
