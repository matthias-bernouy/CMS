import type { ControlCms } from "cms-control/ControlCms";
import { getConnectorProviderSettings } from "cms-control/core/management/integrations/connectorProviderSettings";

export default async function getConnectorProvider(_req: Request, cms: ControlCms) {
    return Response.json(await getConnectorProviderSettings(cms));
}
