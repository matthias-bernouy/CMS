import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { parseRevision, siteBlocTag } from "cms-control/core/content/siteBloc/dto";
import { publishSiteBloc } from "cms-control/core/content/siteBloc/service";

export default async function postSiteBlocPublication(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const definition = await publishSiteBloc(cms, siteBlocTag(req.url), parseRevision(body.expectedDraftRevision));
    return Response.json(definition);
}
