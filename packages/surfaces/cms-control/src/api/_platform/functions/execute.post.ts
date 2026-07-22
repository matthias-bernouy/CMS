import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { executeAdminFunction } from "cms-control/core/admin/control/workflows/functionExecution";

export default async function executeFunction(req: Request, cms: ControlCms): Promise<Response> {
    return executeAdminFunction(cms, req, await readJsonBody(req));
}
