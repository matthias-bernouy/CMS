import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";
import { composeShell } from "@bernouy/cms-content";
import { CONTENT_REGION_ATTR } from "cms-control/core/editorSystemV2/contentRegionAttrs";

export default async function getPage(req: Request, cms: ControlCms) {

    const url = new URL(req.url);

    const id = url.searchParams.get("id");

    if ( !id ) throw new MissingParam("id");

    const res = await cms.repository.getPageById(id);

    if (!res) throw new Error("Undefiened");

    const system = await cms.repository.getSystem();

    const webFormat = {
        ...res,
        // Compose the content into its Shell so the editor canvas shows the real
        // wrapper (header / footer + the binding core). The content is wrapped in
        // [data-cms-content] — the anchor save uses to extract the page's OWN
        // content back out of the Shell (editor-only; delivery composes raw).
        composed: composeShell(system.editor.shell, `<div ${CONTENT_REGION_ATTR} style="display:contents">${res.content}</div>`),
        visible: res.visible ? "on" : "off",
        tags: res.tags.join(",")
    }

    return new Response(JSON.stringify(webFormat));
}
