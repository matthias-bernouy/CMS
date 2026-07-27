import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { parseCreateSiteBlocInput } from "cms-control/core/content/siteBloc/dto";
import { createSiteBloc } from "cms-control/core/content/siteBloc/service";

export default async function postSiteBloc(req: Request, cms: ControlCms) {
    const definition = await createSiteBloc(cms, parseCreateSiteBlocInput(await readJsonBody(req)));
    return Response.json(definition, { status: 201 });
}
