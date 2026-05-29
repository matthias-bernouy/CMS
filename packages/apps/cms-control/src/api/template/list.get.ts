import type { ControlCms } from "cms-control/ControlCms";

export default async function getTemplates(_req: Request, cms: ControlCms) {
    const templates = await cms.repository.getTemplatesMetadata();
    return new Response(JSON.stringify(templates), {
        headers: { "Content-Type": "application/json" }
    });
}
