import type { ControlCms } from "cms-control/ControlCms";
import { parseOptionalRevision, siteBlocTag } from "cms-control/core/content/siteBloc/dto";
import { previewSiteBloc } from "cms-control/core/content/siteBloc/service";

export default async function getSiteBlocDraftScript(req: Request, cms: ControlCms) {
    const revision = parseOptionalRevision(new URL(req.url).searchParams.get("revision"));
    const artifact = await previewSiteBloc(cms, siteBlocTag(req.url), revision);
    return new Response(artifact.viewJS, {
        headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "private, no-store" },
    });
}
