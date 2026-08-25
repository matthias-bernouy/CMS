import type { ControlCms } from "cms-control/ControlCms";
import { hardenStoredHtml, wrapBindingCore } from "@bernouy/cms-content";
import { CMS_BINDING_ATTRIBUTES, CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
import { CONTENT_REGION_ATTR } from "cms-control/core/editorSystemV2/contentRegionAttrs";
import { buildEditorFrameFoucCss } from "cms-control/core/editorSystemV2/frameFouc";
import { networkInertHtml } from "cms-control/core/editorSystemV2/networkInertHtml";

type EditorFrameType = "page" | "template";

export default async function getEditorFrame(req: Request, cms: ControlCms): Promise<Response> {
    const url = new URL(req.url);
    const type = frameType(url.searchParams.get("type"));
    const id = url.searchParams.get("id");

    if (type === "page") {
        return renderPageFrame(url, cms);
    }

    if (!id) {
        return redirectToListing(url, type);
    }

    const document = await cms.repository.getTemplateById(id);

    if (!document) {
        return redirectToListing(url, type);
    }

    const basePath = controlBasePath(url.pathname);
    const content = `<div ${CONTENT_REGION_ATTR} style="display:contents">${document.content}</div>`;
    const composed = hardenStoredHtml(content);
    const foucCss = await buildEditorFrameFoucCss(composed, cms.repository);

    return new Response(
        renderFrameDocument({
            basePath,
            title: document.name,
            description: document.description ?? "",
            composed,
            foucCss,
        }),
        {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
            },
        },
    );
}

async function renderPageFrame(url: URL, cms: ControlCms): Promise<Response> {
    const id = url.searchParams.get("id");
    const path = url.searchParams.get("path");
    const page = id ? await cms.repository.getPageById(id) : path ? await cms.repository.getPage(path) : null;

    if (!page) {
        return redirectToPages(url);
    }

    const basePath = controlBasePath(url.pathname);
    const content = `<div ${CONTENT_REGION_ATTR} style="display:contents">${page.content}</div>`;
    const composed = wrapBindingCore(content);
    const hardened = hardenStoredHtml(composed);
    const foucCss = await buildEditorFrameFoucCss(hardened, cms.repository);

    return new Response(
        renderFrameDocument({
            basePath,
            title: page.title,
            description: page.description,
            composed: hardened,
            foucCss,
        }),
        {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
            },
        },
    );
}

function frameType(value: string | null): EditorFrameType {
    if (value === "template") {
        return value;
    }
    return "page";
}

function renderFrameDocument(input: {
    basePath: string;
    title: string;
    description: string;
    composed: string;
    foucCss: string;
}): string {
    const composed = withEditorBindingCore(networkInertHtml(input.composed));
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="basePath" content="${escapeHtml(input.basePath)}">
    <title>${escapeHtml(input.title)}</title>
    <meta name="description" content="${escapeHtml(input.description)}">
    ${input.foucCss ? `<style id="cms-bloc-fouc-shell">${input.foucCss}</style>` : ""}
    <link rel="stylesheet" href="${input.basePath}/.cms/style">
    <script defer src="${input.basePath}/api/editor/component.js"></script>
    <script defer src="${input.basePath}/api/editor/binding-core.js"></script>
    <script defer src="${input.basePath}/api/editor/view-script.js"></script>
</head>
<body>
    <div data-cms-editor-root style="display:contents">${composed}</div>
</body>
</html>`;
}

function withEditorBindingCore(composed: string): string {
    const forceAttr = CMS_BINDING_ATTRIBUTES.sourceStateForce;
    if (!hasBindingCore(composed)) {
        return `<${CMS_BINDING_CORE_TAG} ${CMS_BINDING_ATTRIBUTES.bindingDisabled} ${forceAttr}="loading">${composed}</${CMS_BINDING_CORE_TAG}>`;
    }

    return composed.replace(new RegExp(`<${CMS_BINDING_CORE_TAG}\\b([^>]*)>`, "i"), (_match, attrs: string) => {
        let nextAttrs = attrs;
        if (!hasAttribute(nextAttrs, CMS_BINDING_ATTRIBUTES.bindingDisabled)) {
            nextAttrs += ` ${CMS_BINDING_ATTRIBUTES.bindingDisabled}`;
        }
        if (!hasAttribute(nextAttrs, forceAttr)) {
            nextAttrs += ` ${forceAttr}="loading"`;
        }
        return `<${CMS_BINDING_CORE_TAG}${nextAttrs}>`;
    });
}

function hasBindingCore(value: string): boolean {
    return new RegExp(`<${CMS_BINDING_CORE_TAG}\\b`, "i").test(value);
}

function hasAttribute(attrs: string, name: string): boolean {
    return new RegExp(`\\s${name}(?:\\s|=|$)`, "i").test(attrs);
}

function redirectToPages(url: URL): Response {
    return Response.redirect(`${controlBasePath(url.pathname)}/admin/pages`, 302);
}

function redirectToListing(url: URL, type: EditorFrameType): Response {
    return Response.redirect(`${controlBasePath(url.pathname)}/admin/${type}s`, 302);
}

function controlBasePath(pathname: string): string {
    const marker = "/api/editor/frame";
    const index = pathname.indexOf(marker);
    if (index <= 0) {
        return "";
    }

    return pathname.slice(0, index);
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
