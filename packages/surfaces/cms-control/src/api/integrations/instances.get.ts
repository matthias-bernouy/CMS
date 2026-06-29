import type { ControlCms } from "cms-control/ControlCms";
import {
    buildIntegrationInstanceView,
    loadIntegrationArtifactContext,
} from "cms-control/core/integrations/instanceViews";

export default async function getIntegrationInstances(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
        const instance = await cms.integrationInstances.get(id);
        if (!instance) return new Response("Not found", { status: 404 });
        const context = await loadIntegrationArtifactContext(cms);
        return Response.json(buildIntegrationInstanceView(context, instance, true));
    }

    const context = await loadIntegrationArtifactContext(cms);
    const instances = await cms.integrationInstances.list();
    return Response.json(instances.map(instance => buildIntegrationInstanceView(context, instance, false)));
}
