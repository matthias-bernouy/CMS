import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { pageSeoDetail } from "cms-control/core/content/page/localization/pageSeoDetail";

export type PageSeoDetailResponse = Awaited<ReturnType<typeof pageSeoDetail>>;

export default async function getPageSeo(req: Request, cms: ControlCms): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        throw new MissingParam("id");
    }
    return Response.json(await pageSeoDetail(cms, id));
}
