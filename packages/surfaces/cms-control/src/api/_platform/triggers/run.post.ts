import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";

export default async function runScheduledTrigger(req: Request, cms: ControlCms): Promise<Response> {
    if (!cms.triggers) {
        return new Response("triggers not configured", { status: 501 });
    }
    const scheduler = cms.config.scheduledTriggers;
    if (!scheduler?.enabled || !scheduler.runNow) {
        return new Response("scheduled trigger runner not available", { status: 503 });
    }
    const body = await readJsonBody(req);
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
        throw new MissingParam("id");
    }
    const trigger = await cms.triggers.getTrigger(id);
    if (!trigger) {
        return new Response("trigger not found", { status: 404 });
    }
    if (trigger.event.kind !== "schedule") {
        throw new InvalidParam("id", "must identify a scheduled trigger.");
    }
    const result = await scheduler.runNow(id);
    return Response.json(result, { status: result.status === "already_running" ? 409 : 200 });
}
