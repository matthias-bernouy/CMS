import type { ControlCms } from "cms-control/ControlCms";
import { definitionForUpgrade } from "cms-control/core/management/integrations/definitions";
import {
    integrationInstallationDeps,
    readInstallationActionBody,
} from "cms-control/core/management/integrations/installationActions";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { runIntegrationInstallation } from "@bernouy/cms-integrations";

export default async function postIntegrationInstallationUpgrade(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }
    const body = await readInstallationActionBody(req);
    const targetDefinition = await definitionForUpgrade(cms.integrationCatalog, id, body);
    const result = await runIntegrationInstallation({
        mode: "upgrade",
        deps: integrationInstallationDeps(cms),
        installations: cms.integrationInstallations,
        integrationId: id,
        targetDefinition,
        body,
    });
    return Response.json(result);
}
