import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { readInstallationActionBody } from "cms-control/core/management/integrations/installationActions";
import { rerunInstallation } from "cms-control/core/management/integrations/installationActions/rerun";

export default async function postIntegrationInstallationRerun(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }
    return Response.json(await rerunInstallation(cms, id, await readInstallationActionBody(req)));
}
