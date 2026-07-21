import type { ControlCms } from "cms-control/ControlCms";
import { functionCatalog, type FunctionCatalogSource } from "cms-control/core/control/workflows/functionCatalog";

export type { FunctionCatalogSource };

export default async function getFunctionCatalog(_req: Request, cms: ControlCms): Promise<Response> {
    return Response.json(await functionCatalog(cms));
}
