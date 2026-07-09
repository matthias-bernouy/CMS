import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";
import { toFunctionDetailItem } from "../functions.get";

export default async function getFunctionDetail(req: Request, cms: ControlCms): Promise<Response> {
    const repository = cms.functions;
    if (!repository) return new Response("functions not configured", { status: 501 });

    const id = new URL(req.url).searchParams.get("id")?.trim();
    if (!id) throw new MissingParam("id");

    const fn = await repository.getFunction(id);
    if (!fn) return new Response("function not found", { status: 404 });
    return Response.json(toFunctionDetailItem(fn));
}
