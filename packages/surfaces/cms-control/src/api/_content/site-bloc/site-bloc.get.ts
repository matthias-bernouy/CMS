import type { ControlCms } from "cms-control/ControlCms";
import { siteBlocTag } from "cms-control/core/content/siteBloc/dto";
import { requireSiteBloc } from "cms-control/core/content/siteBloc/service";

export default async function getSiteBloc(req: Request, cms: ControlCms) {
    return Response.json(await requireSiteBloc(cms, siteBlocTag(req.url)));
}
