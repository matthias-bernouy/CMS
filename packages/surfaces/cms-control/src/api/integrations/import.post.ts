import type { ControlCms } from "cms-control/ControlCms";
import { importBlocArtifact } from "cms-control/core/bloc/importBlocArtifact";
import { definitionsForImport } from "cms-control/core/integrations/definitions";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import {
    type IntegrationImportDeps,
    parseIntegrationImportRequest,
    runIntegrationInstance,
} from "@bernouy/cms-integrations";

export default async function postIntegrationImport(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const definitions = await definitionsForImport(cms.integrationCatalog, body);
    const request = parseIntegrationImportRequest(body, definitions);
    const blocRepository = cms.integrationBlocRepository ?? cms.repository;
    const deps: IntegrationImportDeps = {
        sources: cms.sources,
        secrets: cms.secrets,
        dashboards: cms.dashboards,
        blocs: {
            importBloc: (artifact, options) => importBlocArtifact(cms, { ...artifact, force: options.force }, { repository: blocRepository }),
        },
        connectorDeployers: cms.integrationConnectorDeployers,
    };
    const result = await runIntegrationInstance({
        mode: "create",
        deps,
        instances: cms.integrationInstances,
        dto: request.dto,
        siteIntegrations: request.siteIntegrations,
    });

    return Response.json(result);
}
