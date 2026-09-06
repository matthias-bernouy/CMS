import type { ControlCms } from "cms-control/ControlCms";
import { definitionsForRerun } from "cms-control/core/management/integrations/definitions";
import {
    installRequiredCollectionSources,
    integrationInstallationDeps,
} from "cms-control/core/management/integrations/installationActions";
import { runIntegrationInstallation } from "@bernouy/cms-integrations";
import { parseIntegrationImportDto } from "@bernouy/cms-integrations";
import { invalidateGlobalStyleAndPages } from "cms-control/core/admin/server/cache/invalidation";

export async function rerunInstallation(cms: ControlCms, id: string, body: Record<string, unknown>) {
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
        return result;
    } finally {
        invalidateGlobalStyleAndPages(cms);
    }
}
