import type { ControlCms } from "cms-control/ControlCms";
import { definitionForUpgrade } from "cms-control/core/management/integrations/definitions";
import {
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
    const result = await runIntegrationInstallation({
        mode: "upgrade",
        deps: integrationInstallationDeps(cms),
        installations: cms.integrationInstallations,
        integrationId: id,
        targetDefinition,
        ...(preflight.packageDigest ? { expectedPackageDigest: preflight.packageDigest } : {}),
        body,
        packageResolver: cms.integrationPackageResolver,
    });
    return Response.json(result);
}
