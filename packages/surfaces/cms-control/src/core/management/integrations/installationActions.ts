import type { ControlCms } from "cms-control/ControlCms";
import { importBlocArtifact } from "cms-control/core/content/bloc/importBlocArtifact";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { publishedPageResolver } from "cms-control/core/management/integrations/publishedPageResolver";
import type { IntegrationImportDeps } from "@bernouy/cms-integrations";

export function integrationInstallationDeps(cms: ControlCms): IntegrationImportDeps {
    const blocRepository = cms.integrationBlocRepository ?? cms.repository;
    return {
        sources: cms.sources,
        ...(cms.functions ? { functions: cms.functions } : {}),
        roles: cms.roles,
        secrets: cms.secrets,
        dashboards: cms.dashboards,
        dashboardViews: cms.dashboardViews,
        dashboardAssignments: cms.dashboardAssignments,
        relations: cms.relations,
        installations: cms.integrationInstallations,
        ...(cms.triggers ? { triggers: cms.triggers } : {}),
        ...(cms.sourceOverlays ? { sourceOverlays: cms.sourceOverlays } : {}),
        blocs: {
            importBloc: (artifact, options, context) =>
                importBlocArtifact(
                    cms,
                    { ...artifact, force: options.force },
                    {
                        repository: blocRepository,
                        ownership: {
                            kind: "integration",
                            integrationKind: context.integrationKind,
                            installationId: context.installationId,
                            definitionVersion: context.definitionVersion,
                        },
                    },
                ),
        },
        connectorDeployers: cms.integrationConnectorDeployers,
        ...(cms.integrationMigrationRuntime ? { migrationRuntime: cms.integrationMigrationRuntime } : {}),
        provisioners: cms.integrationProvisioners,
        sourceExecutorDeps: cms.sourceExecutorDeps,
        resolvePublishedPage: publishedPageResolver(cms.repository, cms.config?.deliveryUrl),
    };
}

export async function readInstallationActionBody(req: Request): Promise<Record<string, unknown>> {
    const text = await req.text();
    if (!text.trim()) {
        return {};
    }
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
