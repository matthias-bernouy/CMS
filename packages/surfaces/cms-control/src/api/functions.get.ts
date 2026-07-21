import type { ControlCms } from "cms-control/ControlCms";
import {
    toFunctionListItem,
    type FunctionDetailItem,
    type FunctionListItem,
    type FunctionListResponse,
} from "cms-control/core/control/workflows/functionViews";

export type { FunctionDetailItem, FunctionListItem, FunctionListResponse };

export default async function listFunctions(_req: Request, cms: ControlCms): Promise<Response> {
    const repository = cms.functions;
    if (!repository) {
        return new Response("functions not configured", { status: 501 });
    }
    const functions = await repository.getAllFunctions();
    functions.sort((left, right) => left.id.localeCompare(right.id));
    return Response.json(functions.map(toFunctionListItem) satisfies FunctionListResponse);
}
