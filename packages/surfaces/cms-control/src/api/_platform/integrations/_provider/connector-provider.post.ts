import type { ControlCms } from "cms-control/ControlCms";
import { readJsonOrFormBody } from "cms-control/core/admin/http/readJsonOrFormBody";
import { updateConnectorProviderSettings } from "cms-control/core/management/integrations/connectorProviderSettings";
import { parseConnectorProviderUpdateDto } from "cms-control/core/validation/integrations/parseConnectorProviderDto";

export default async function postConnectorProvider(req: Request, cms: ControlCms) {
    const body = await readJsonOrFormBody(req);
    const dto = parseConnectorProviderUpdateDto(body);
    return Response.json(await updateConnectorProviderSettings(cms, dto));
}
