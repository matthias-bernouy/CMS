import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { createTriggerDefinition } from "cms-control/core/admin/control/workflows/triggerCreation";

export default async function createTrigger(req: Request, cms: ControlCms): Promise<Response> {
    if (!cms.triggers) {
        return new Response("triggers not configured", { status: 501 });
    }
    if (!cms.functions) {
        return new Response("functions not configured", { status: 501 });
    }
    const payload = await readJsonBody(req);
    const trigger = await createTriggerDefinition(cms, payload.definition, payload.enabled);
    return Response.json(trigger, { status: 201 });
}
