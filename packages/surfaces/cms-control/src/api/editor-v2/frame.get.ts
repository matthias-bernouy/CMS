import type { ControlCms } from "cms-control/ControlCms";
import { composeShell } from "@bernouy/cms-content";
import { CONTENT_REGION_ATTR } from "cms-control/core/editorSystem/contentRegionAttrs";

export default async function getEditorV2Frame(req: Request, cms: ControlCms): Promise<Response> {
    const url = new URL(req.url);
    const pageId = url.searchParams.get("id");
    const pagePath = url.searchParams.get("path");
    const page = pageId
        ? await cms.repository.getPageById(pageId)
        : pagePath
        ? await cms.repository.getPage(pagePath)
        : null;

    if (!page) {
        return new Response(renderMissingPage(pageId ? `id ${pageId}` : pagePath ?? "unknown page"), {
            status: 404,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
            },
        });
    }

    const system = await cms.repository.getSystem();
    const basePath = controlBasePath(url.pathname);
    const content = `<div ${CONTENT_REGION_ATTR} style="display:contents">${page.content}</div>`;
    const composed = composeShell(system.editor.shell, content);

    return new Response(renderFrameDocument({
        basePath,
        title: page.title,
        description: page.description,
        composed,
    }), {
        headers: {
            "Content-Type": "text/html; charset=utf-8",
        },
    });
}

function renderFrameDocument(input: {
    basePath: string;
    title: string;
    description: string;
    composed: string;
}): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="basePath" content="${escapeHtml(input.basePath)}">
    <title>${escapeHtml(input.title)}</title>
    <meta name="description" content="${escapeHtml(input.description)}">
    <link rel="stylesheet" href="${input.basePath}/.cms/style">
    <script src="${input.basePath}/assets/control-components.js"></script>
    <script src="${input.basePath}/api/editor/script.js"></script>
</head>
<body>
    <div data-cms-editor-root style="display:contents">${input.composed}</div>
</body>
</html>`;
}

function renderMissingPage(path: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page not found</title>
</head>
<body>
    <main data-cms-editor-root>
        <section ${CONTENT_REGION_ATTR}>
            <h1>Page not found</h1>
            <p>No page exists for ${escapeHtml(path)}.</p>
        </section>
    </main>
</body>
</html>`;
}

function controlBasePath(pathname: string): string {
    const marker = "/api/editor-v2/frame";
    const index = pathname.indexOf(marker);
    if (index <= 0) return "";

    return pathname.slice(0, index);
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;");
}
