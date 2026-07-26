import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { integrationVersionReleaseLevel, isExactIntegrationVersion } from "@bernouy/cms-integrations";
import { preflightIntegrationUpgrade } from "cms-control/core/management/integrations/upgrade/preflight";

export default async function getIntegrationInstallationVersions(request: Request, cms: ControlCms): Promise<Response> {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) {
        throw new MissingParam("id");
    }
    const installation = await cms.integrationInstallations.get(id);
    if (!installation) {
        return Response.json(
            { code: "integration_installation_not_found", error: "Integration installation was not found" },
            { status: 404 },
        );
    }
    const index = await cms.integrationCatalog.getIndex(installation.id);
    if (!index) {
        return Response.json(
            { code: "integration_versions_not_found", error: "Integration version history was not found" },
            { status: 404 },
        );
    }
    const current = installation.definitionVersion;
    const candidates = index.versions.filter(
        ({ version }) => !isExactIntegrationVersion(current) || integrationVersionReleaseLevel(current, version),
    );
    const targets = await Promise.all(
        candidates.map((version) =>
            preflightIntegrationUpgrade({
                repository: cms.integrationCatalog,
                releases: cms.integrationUpgradeReleases,
                installation,
                version,
            }),
        ),
    );
    const versions = targets.filter(({ eligible }) => eligible).map(({ version }) => version);
    return Response.json({
        id: installation.id,
        current,
        ...(index.stable && versions.includes(index.stable) ? { stable: index.stable } : {}),
        ...(index.latest && versions.includes(index.latest) ? { latest: index.latest } : {}),
        versions,
        targets,
    });
}
