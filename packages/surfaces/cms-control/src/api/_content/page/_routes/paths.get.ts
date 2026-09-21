import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { pagePathsDetail } from "cms-control/core/content/page/localization/pagePathsDetail";

export type PathsDetailResponse = Awaited<ReturnType<typeof pagePathsDetail>>;

export default async function getPaths(req: Request, cms: ControlCms): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }
    return Response.json(await pagePathsDetail(cms, id));
}
