import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import {
    type IntegrationImportDeps,
    parseIntegrationImportRequest,
    runIntegrationInstance,
} from "@bernouy/cms-integrations";

export default async function postIntegrationImport(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const request = parseIntegrationImportRequest(body, cms.integrations);
    const deps: IntegrationImportDeps = {
        sources: cms.sources,
        secrets: cms.secrets,
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
