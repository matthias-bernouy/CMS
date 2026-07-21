import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

export default async function getTemplate(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }

    const template = await cms.repository.getTemplateById(id);
    if (!template) {
        throw new InvalidParam("id", "Unknown template id.");
    }

    return new Response(JSON.stringify(template), {
        headers: { "Content-Type": "application/json" },
    });
}
