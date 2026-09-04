import type { ControlCms } from "cms-control/ControlCms";
import {
    collectionDependencyDefinitions,
    definitionForUpgrade,
    installedIntegrationDefinitions,
} from "cms-control/core/management/integrations/definitions";
import {
    installRequiredCollectionSources,
    integrationInstallationDeps,
    readInstallationActionBody,
} from "cms-control/core/management/integrations/installationActions";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import {
    IntegrationInputError,
    MissingIntegrationInstallationError,
    resolveExactIntegrationDefinitionVersion,
    runIntegrationInstallation,
} from "@bernouy/cms-integrations";
import { assertIntegrationUpgradePreflight } from "cms-control/core/management/integrations/upgrade/preflight";
import { invalidateGlobalStyleAndPages } from "cms-control/core/admin/server/cache/invalidation";

export default async function postIntegrationInstallationUpgrade(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }
    const body = await readInstallationActionBody(req);
    const targetDefinition = await definitionForUpgrade(cms.integrationCatalog, id, body);
    const installation = await cms.integrationInstallations.get(id);
    if (!installation) {
        throw new MissingIntegrationInstallationError(id);
    }
    const index = await cms.integrationCatalog.getIndex(id);
    const targetVersion =
        index && targetDefinition.version
            ? resolveExactIntegrationDefinitionVersion(index, targetDefinition.version)
            : null;
    if (!targetVersion) {
        throw new IntegrationInputError("version", "the exact repository version changed during upgrade preflight");
    }
    const preflight = await assertIntegrationUpgradePreflight({
        repository: cms.integrationCatalog,
        releases: cms.integrationUpgradeReleases,
        installation,
        version: targetVersion,
    });
    const installedDefinitions = await installedIntegrationDefinitions(
        cms.integrationCatalog,
        cms.integrationInstallations,
        cms.integrationPackageResolver,
        [id],
    );
    const siteIntegrations = [
        targetDefinition,
        ...installedDefinitions,
        ...(await collectionDependencyDefinitions(cms.integrationCatalog, targetDefinition)),
    ];
    const deps = integrationInstallationDeps(cms);
    try {
        if (targetDefinition.schema === "cms.integration.definition.v2" && targetDefinition.type === "collection") {
            await installRequiredCollectionSources(
                cms,
                {
                    dto: {
                        kind: targetDefinition.kind,
                        answers: {},
                        options: {},
                    },
                    siteIntegrations,
                },
                deps,
            );
        }
        const result = await runIntegrationInstallation({
            mode: "upgrade",
            deps,
            installations: cms.integrationInstallations,
            integrationId: id,
            targetDefinition,
            ...(preflight.packageDigest ? { expectedPackageDigest: preflight.packageDigest } : {}),
            body,
            siteIntegrations,
            packageResolver: cms.integrationPackageResolver,
        });
        return Response.json(result);
    } finally {
        invalidateGlobalStyleAndPages(cms);
    }
}
