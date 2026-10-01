import type { ControlCms } from "cms-control/ControlCms";
import { siteBlocTag } from "cms-control/core/content/siteBloc/dto";
import { blocPreview } from "cms-control/core/content/bloc/preview/render";
import { createContentReader, generateStyleEntry } from "@bernouy/cms-content";
import { buildPreviewBindingCore } from "cms-control/core/content/bloc/preview/runtime/buildBindingCore";
import { buildPreviewComponentRuntime } from "cms-control/core/content/bloc/preview/runtime/buildComponent";

export default async function getBlocPreview(req: Request, cms: ControlCms): Promise<Response> {
    const url = new URL(req.url);
    const basePath = url.pathname.slice(0, url.pathname.indexOf("/api/bloc/preview"));
    const tag = siteBlocTag(req.url);
    // Opaque iframes cannot send the session cookie for asset subrequests. Reuse
    // the authenticated request's runtime and theme bytes inside this document.
    const identityRequest = new Request(req.url);
    const [component, bindings, style] = await Promise.all([
        buildPreviewComponentRuntime(identityRequest, cms).then((response) => response.text()),
        buildPreviewBindingCore(identityRequest, cms).then((response) => response.text()),
        generateStyleEntry(createContentReader(cms.repository)),
    ]);
    return blocPreview(cms.repository, tag, basePath, {
        scripts: [component, bindings],
        style: new TextDecoder().decode(style.raw),
    });
}
