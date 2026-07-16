import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import { executeAdminFunction } from "cms-control/core/control/workflows/functionExecution";

export default async function executeFunction(req: Request, cms: ControlCms): Promise<Response> {
    return executeAdminFunction(cms, req, await readJsonBody(req));
}
