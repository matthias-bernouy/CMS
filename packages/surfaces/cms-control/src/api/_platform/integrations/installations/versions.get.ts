import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";

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
    return Response.json({
        id: installation.id,
        current: installation.definitionVersion,
        stable: index.stable,
        latest: index.latest,
        versions: index.versions.map(({ version }) => version),
    });
}
