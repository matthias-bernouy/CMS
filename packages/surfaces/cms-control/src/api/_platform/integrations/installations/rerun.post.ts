import type { ControlCms } from "cms-control/ControlCms";
import { definitionsForRerun } from "cms-control/core/management/integrations/definitions";
import {
    installRequiredCollectionSources,
    integrationInstallationDeps,
    readInstallationActionBody,
} from "cms-control/core/management/integrations/installationActions";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { runIntegrationInstallation } from "@bernouy/cms-integrations";
import { parseIntegrationImportDto } from "@bernouy/cms-integrations";
import { invalidateGlobalStyleAndPages } from "cms-control/core/admin/server/cache/invalidation";

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
    const deps = integrationInstallationDeps(cms);
    const definition = definitions.find(({ kind }) => kind === id);
    try {
        if (definition?.schema === "cms.integration.definition.v2" && definition.type === "collection") {
            await installRequiredCollectionSources(
                cms,
                {
                    dto: parseIntegrationImportDto({ kind: id, resources: body.resources }, definitions),
                    siteIntegrations: definitions,
                },
                deps,
            );
        }
        const result = await runIntegrationInstallation({
            mode: "rerun",
            deps,
            installations: cms.integrationInstallations,
            integrationId: id,
            body,
            siteIntegrations: definitions,
            packageResolver: cms.integrationPackageResolver,
        });
        return Response.json(result);
    } finally {
        invalidateGlobalStyleAndPages(cms);
    }
}
