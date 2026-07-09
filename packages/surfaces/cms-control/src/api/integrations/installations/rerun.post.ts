import type { ControlCms } from "cms-control/ControlCms";
import { importBlocArtifact } from "cms-control/core/bloc/importBlocArtifact";
import { definitionsForRerun } from "cms-control/core/integrations/definitions";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import MissingParam from "cms-control/errors/Http/MissingParam";
import {
    runIntegrationInstallation,
    type IntegrationImportDeps,
} from "@bernouy/cms-integrations";

export default async function postIntegrationInstallationRerun(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new MissingParam("id");
    const body = await readOptionalJsonBody(req);
    const definitions = await definitionsForRerun(cms.integrationCatalog, cms.integrationInstallations, id, body);
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
            importBloc: (artifact, options) => importBlocArtifact(cms, { ...artifact, force: options.force }, { repository: blocRepository }),
        },
        connectorDeployers: cms.integrationConnectorDeployers,
    };
    const result = await runIntegrationInstallation({
        mode: "rerun",
        deps,
        installations: cms.integrationInstallations,
        integrationId: id,
        body,
        siteIntegrations: definitions,
    });
    return Response.json(result);
}

async function readOptionalJsonBody(req: Request): Promise<Record<string, unknown>> {
    const text = await req.text();
    if (!text.trim()) return {};
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        throw new InvalidParam("body", "JSON object expected.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new InvalidParam("body", "JSON object expected.");
    }
    return body as Record<string, unknown>;
}
