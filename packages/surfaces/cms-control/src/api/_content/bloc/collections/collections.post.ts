import type { ControlCms } from "cms-control/ControlCms";
import type { SiteBlocCollection } from "@bernouy/cms-content";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { parseSiteBlocCollectionInput } from "cms-control/core/content/siteBloc/collections";

export type CreateSiteBlocCollectionResponse = SiteBlocCollection;

export default async function postSiteBlocCollection(req: Request, cms: ControlCms): Promise<Response> {
    const input = parseSiteBlocCollectionInput(await readJsonBody(req));
    return Response.json(await cms.repository.createSiteBlocCollection(input), { status: 201 });
}
