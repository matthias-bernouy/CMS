import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";
import { deleteRole } from "@bernouy/cms-permissions";

/** DELETE /api/roles?id= — delete a custom role (refuses built-ins / in-use roles). */
export default async function deleteRoleEndpoint(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new MissingParam("id");
    await deleteRole(cms.roles, cms.users, id);
    return new Response("Deleted", { status: 200 });
}
