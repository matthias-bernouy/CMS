import type { ControlCms } from "cms-control/ControlCms";
import { siteBlocCatalogue } from "cms-control/core/content/siteBloc/catalogue";

export default async function getBlocCatalogue(req: Request, cms: ControlCms) {
    const params = new URL(req.url).searchParams;
    const items = await siteBlocCatalogue(cms, {
        ...(params.get("search") ? { search: params.get("search")! } : {}),
        ...(params.get("collection") ? { collection: params.get("collection")! } : {}),
        ...(params.get("origin") ? { origin: params.get("origin")! } : {}),
        ...(params.get("group") ? { group: params.get("group")! } : {}),
    });
    if (params.get("view") === "groups") {
        const groups = [...new Set(items.map((item) => item.group).filter(Boolean))].sort();
        return Response.json(groups.map((value) => ({ value })));
    }
    return Response.json(items);
}
