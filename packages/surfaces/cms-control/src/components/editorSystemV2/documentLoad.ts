import { Shell } from "@bernouy/cms-editor-system-v2";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { EditorResource, PageConfigDetailResponse, TemplateDetail } from "./editorResources";
import { resourceLabel } from "./resource";

export async function loadDocumentConfig(shell: Shell, resource: EditorResource, id: string): Promise<void> {
    if (resource !== "page") {
        await loadTemplateConfig(shell, id);
        return;
    }

    await loadPageConfig(shell, id);
}

async function loadPageConfig(shell: Shell, pageId: string): Promise<void> {
    const response = await fetch(`${getMetaBasePath()}/api/page/configDetail?id=${encodeURIComponent(pageId)}`);
    if (response.redirected) {
        window.location.href = response.url;
        return;
    }
    if (!response.ok) {
        shell.setSaveStatus("Page load failed");
        return;
    }

    const page = (await response.json()) as PageConfigDetailResponse;
    shell.setPageConfig({
        id: page.id,
        title: page.title,
        path: page.path,
        description: page.description,
        tags: page.tags,
        published: page.published,
        defaultTemplateCategory: page.defaultTemplateCategory,
    });
}

async function loadTemplateConfig(shell: Shell, id: string): Promise<void> {
    const response = await fetch(`${getMetaBasePath()}/api/template?id=${encodeURIComponent(id)}`);
    if (response.redirected) {
        window.location.href = response.url;
        return;
    }
    if (!response.ok) {
        shell.setSaveStatus(`${resourceLabel("template")} load failed`);
        return;
    }

    const detail = (await response.json()) as TemplateDetail;
    shell.setPageConfig({
        id: detail.id,
        title: detail.name,
        path: detail.identifier,
        description: detail.description ?? "",
        tags: detail.category ? [detail.category] : [],
        published: true,
    });
}
