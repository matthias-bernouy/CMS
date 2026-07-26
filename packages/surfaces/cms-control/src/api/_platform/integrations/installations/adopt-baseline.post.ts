import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { adoptLegacyBaselineFromControl } from "cms-control/core/management/integrations/baselineAdoption";
import { readInstallationActionBody } from "cms-control/core/management/integrations/installationActions";

export default async function postIntegrationBaselineAdoption(request: Request, cms: ControlCms) {
    const integrationId = new URL(request.url).searchParams.get("id")?.trim();
    if (!integrationId) {
        throw new MissingParam("id");
    }
    const result = await adoptLegacyBaselineFromControl(
        cms,
        request,
        integrationId,
        await readInstallationActionBody(request),
    );
    return Response.json(result);
}
