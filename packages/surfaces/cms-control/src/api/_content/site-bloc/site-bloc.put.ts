import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { parseSaveSiteBlocInput, siteBlocTag } from "cms-control/core/content/siteBloc/dto";
import { saveSiteBloc } from "cms-control/core/content/siteBloc/service";

export default async function putSiteBloc(req: Request, cms: ControlCms) {
    const definition = await saveSiteBloc(cms, siteBlocTag(req.url), parseSaveSiteBlocInput(await readJsonBody(req)));
    return Response.json(definition);
}
