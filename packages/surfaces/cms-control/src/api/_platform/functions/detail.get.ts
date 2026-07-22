import type { ControlCms } from "cms-control/ControlCms";
import { toFunctionDetailItem } from "cms-control/core/admin/control/workflows/functionViews";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";

export default async function getFunctionDetail(req: Request, cms: ControlCms): Promise<Response> {
    const repository = cms.functions;
    if (!repository) {
        return new Response("functions not configured", { status: 501 });
    }
    const id = new URL(req.url).searchParams.get("id")?.trim();
    if (!id) {
        throw new MissingParam("id");
    }
    const fn = await repository.getFunction(id);
    return fn ? Response.json(toFunctionDetailItem(fn)) : new Response("function not found", { status: 404 });
}
