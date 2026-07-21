import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import { createFunctionDefinition } from "cms-control/core/control/workflows/functionCreation";

export default async function createFunction(req: Request, cms: ControlCms): Promise<Response> {
    if (!cms.functions) {
        return new Response("functions not configured", { status: 501 });
    }
    const payload = await readJsonBody(req);
    return Response.json(await createFunctionDefinition(cms, payload.definition), { status: 201 });
}
