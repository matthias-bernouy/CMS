import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { parseSiteBlocCollectionInput, requireSiteBlocCollection } from "cms-control/core/content/siteBloc/collections";
import { ContentValidationError } from "@bernouy/cms-content";

export default async function putSiteBlocCollection(req: Request, cms: ControlCms): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        throw new ContentValidationError("id", "collection ID is required");
    }
    await requireSiteBlocCollection(cms, id);
    const collection = await cms.repository.updateSiteBlocCollection(
        id,
        parseSiteBlocCollectionInput(await readJsonBody(req)),
    );
    return Response.json(collection);
}
