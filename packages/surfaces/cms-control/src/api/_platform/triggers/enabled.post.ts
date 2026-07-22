import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";

export default async function setTriggerEnabled(req: Request, cms: ControlCms): Promise<Response> {
    const repository = cms.triggers;
    if (!repository) {
        return new Response("triggers not configured", { status: 501 });
    }

    const body = await readJsonBody(req);
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
        throw new MissingParam("id");
    }
    if (typeof body.enabled !== "boolean") {
        throw new InvalidParam("enabled", "must be boolean.");
    }

    const updated = await repository.setEnabled(id, body.enabled);
    if (!updated) {
        return new Response("trigger not found", { status: 404 });
    }
    return Response.json(updated);
}
