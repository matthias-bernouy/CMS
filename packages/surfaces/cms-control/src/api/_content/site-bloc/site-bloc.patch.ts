import type { ControlCms } from "cms-control/ControlCms";
import { ContentValidationError } from "@bernouy/cms-content";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { parseRevision, siteBlocTag } from "cms-control/core/content/siteBloc/dto";

export default async function patchSiteBloc(req: Request, cms: ControlCms) {
    const tag = siteBlocTag(req.url);
    const body = await readJsonBody(req);
    if (typeof body.archived !== "boolean") {
        throw new ContentValidationError("archived", "boolean expected");
    }
    const expectedRevision = parseRevision(body.expectedDraftRevision);
    const definition = body.archived
        ? await cms.repository.archiveSiteBloc(tag, expectedRevision)
        : await cms.repository.restoreSiteBloc(tag, expectedRevision);
    return Response.json(definition);
}
