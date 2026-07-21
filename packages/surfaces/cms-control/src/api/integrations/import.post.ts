import type { ControlCms } from "cms-control/ControlCms";
import { importBlocArtifact } from "cms-control/core/bloc/importBlocArtifact";
import { definitionsForImport } from "cms-control/core/integrations/definitions";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import {
    type IntegrationImportDeps,
    parseIntegrationImportRequest,
    runIntegrationInstallation,
} from "@bernouy/cms-integrations";

export default async function postIntegrationImport(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const definitions = await definitionsForImport(cms.integrationCatalog, body);
    const request = parseIntegrationImportRequest(body, definitions);
    const blocRepository = cms.integrationBlocRepository ?? cms.repository;
    const deps: IntegrationImportDeps = {
        sources: cms.sources,
        ...(cms.functions ? { functions: cms.functions } : {}),
        roles: cms.roles,
        secrets: cms.secrets,
        dashboards: cms.dashboards,
        relations: cms.relations,
        installations: cms.integrationInstallations,
        ...(cms.triggers ? { triggers: cms.triggers } : {}),
        ...(cms.sourceOverlays ? { sourceOverlays: cms.sourceOverlays } : {}),
        blocs: {
            importBloc: (artifact, options) =>
                importBlocArtifact(cms, { ...artifact, force: options.force }, { repository: blocRepository }),
        },
        connectorDeployers: cms.integrationConnectorDeployers,
    };
    const result = await runIntegrationInstallation({
        mode: "create",
        deps,
        installations: cms.integrationInstallations,
        dto: request.dto,
        siteIntegrations: request.siteIntegrations,
    });

    return Response.json(result);
}
