import type { ControlCms } from "cms-control/ControlCms";
import { definitionsForRerun } from "cms-control/core/management/integrations/definitions";
import {
    integrationInstallationDeps,
    readInstallationActionBody,
} from "cms-control/core/management/integrations/installationActions";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { runIntegrationInstallation } from "@bernouy/cms-integrations";

export default async function postIntegrationInstallationRerun(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }
    const body = await readInstallationActionBody(req);
    const definitions = await definitionsForRerun(
        cms.integrationCatalog,
        cms.integrationInstallations,
        id,
        body,
        cms.integrationPackageResolver,
    );
    const result = await runIntegrationInstallation({
        mode: "rerun",
        deps: integrationInstallationDeps(cms),
        installations: cms.integrationInstallations,
        integrationId: id,
        body,
        siteIntegrations: definitions,
        packageResolver: cms.integrationPackageResolver,
    });
    return Response.json(result);
}
