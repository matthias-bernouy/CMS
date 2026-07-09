import type { TriggerRecord } from "@bernouy/cms-triggers";
import type { ControlCms } from "cms-control/ControlCms";

export type TriggerListItem = TriggerRecord;
export type TriggerListResponse = TriggerListItem[];

export default async function listTriggers(_req: Request, cms: ControlCms): Promise<Response> {
    const repository = cms.triggers;
    if (!repository) return new Response("triggers not configured", { status: 501 });

    const triggers = await repository.getAllTriggers();
    triggers.sort((left, right) => left.id.localeCompare(right.id));
    return Response.json(triggers satisfies TriggerListResponse);
}
