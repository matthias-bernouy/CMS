import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";
import { wrapBindingCore } from "@bernouy/cms-content";
import { CONTENT_REGION_ATTR } from "cms-control/core/editorSystemV2/contentRegionAttrs";

export default async function getPage(req: Request, cms: ControlCms) {
    const url = new URL(req.url);

    const id = url.searchParams.get("id");

    if (!id) {
        throw new MissingParam("id");
    }

    const res = await cms.repository.getPageById(id);

    if (!res) {
        throw new Error("Undefiened");
    }

    const webFormat = {
        ...res,
        composed: wrapBindingCore(`<div ${CONTENT_REGION_ATTR} style="display:contents">${res.content}</div>`),
        visible: res.visible ? "on" : "off",
        tags: res.tags.join(","),
    };

    return new Response(JSON.stringify(webFormat));
}
