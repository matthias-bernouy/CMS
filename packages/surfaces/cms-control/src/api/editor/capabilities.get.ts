import type { ControlCms } from "cms-control/ControlCms";
import { editorCapabilityDto } from "cms-control/core/content/editorSources/capabilityDto";

/** Lists only capabilities from the site's selected contract releases. */
export default async function getEditorCapabilities(_request: Request, cms: ControlCms): Promise<Response> {
    const configured = cms.config.capabilityGateway;
    if (!configured?.catalogue) {
        return Response.json([]);
    }
    const capabilities = await configured.catalogue.list(configured.siteId);
    return Response.json(capabilities.map((capability) => editorCapabilityDto(cms.basePath, capability)));
}
