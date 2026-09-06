import type { ControlCms } from "cms-control/ControlCms";
import { siteBlocTag } from "cms-control/core/content/siteBloc/dto";
import { blocPreview } from "cms-control/core/content/bloc/preview/render";
import { generateStyleEntry } from "@bernouy/cms-content";
import editorComponentGet from "cms-control/api/editor/component.js.get";
import editorBindingCoreGet from "cms-control/api/editor/binding-core.js.get";
import { getInstalledIntegrationThemeContributions } from "cms-control/core/management/integrations/themeContributions";

export default async function getBlocPreview(req: Request, cms: ControlCms): Promise<Response> {
    const url = new URL(req.url);
    const basePath = url.pathname.slice(0, url.pathname.indexOf("/api/bloc/preview"));
    const tag = siteBlocTag(req.url);
    // Opaque iframes cannot send the session cookie for asset subrequests. Reuse
    // the authenticated request's runtime and theme bytes inside this document.
    const identityRequest = new Request(req.url);
    const [component, bindings, style] = await Promise.all([
        editorComponentGet(identityRequest, cms).then((response) => response.text()),
        editorBindingCoreGet(identityRequest, cms).then((response) => response.text()),
        getInstalledIntegrationThemeContributions(cms.integrationInstallations).then((contributions) =>
            generateStyleEntry(cms.repository, contributions),
        ),
    ]);
    return blocPreview(cms.repository, tag, basePath, {
        scripts: [component, bindings],
        style: new TextDecoder().decode(style.raw),
    });
}
