import type { ControlCms } from "cms-control/ControlCms";
import { siteBlocTag } from "cms-control/core/content/siteBloc/dto";
import { controlBasePath, renderSiteBlocFrame, siteBlocFrameMode } from "cms-control/core/content/siteBloc/frames";
import { requireSiteBloc } from "cms-control/core/content/siteBloc/service";

export default async function getSiteBlocFrame(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const definition = await requireSiteBloc(cms, siteBlocTag(req.url));
    return new Response(
        renderSiteBlocFrame(controlBasePath(url.pathname), definition, siteBlocFrameMode(url.searchParams.get("mode"))),
        {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "private, no-store",
            },
        },
    );
}
