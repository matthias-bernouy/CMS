import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { roleEditorData } from "cms-control/core/management/roles/editorData";

/** GET /api/roles/editor?id= — a role's current grants + the available
 *  permission vocabulary (CMS capabilities + gateway endpoints) for the editor. */
export default async function getRoleEditor(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }
    return Response.json(await roleEditorData(cms, id));
}
