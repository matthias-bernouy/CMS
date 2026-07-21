import type { ControlCms } from "cms-control/ControlCms";
import {
    buildIntegrationInstallationView,
    loadIntegrationArtifactContext,
} from "cms-control/core/integrations/installationViews";

export default async function getIntegrationInstallations(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
        const installation = await cms.integrationInstallations.get(id);
        if (!installation) {
            return new Response("Not found", { status: 404 });
        }
        const context = await loadIntegrationArtifactContext(cms);
        return Response.json(buildIntegrationInstallationView(context, installation, true));
    }

    const context = await loadIntegrationArtifactContext(cms);
    const installations = await cms.integrationInstallations.list();
    return Response.json(
        installations.map((installation) => buildIntegrationInstallationView(context, installation, false)),
    );
}
