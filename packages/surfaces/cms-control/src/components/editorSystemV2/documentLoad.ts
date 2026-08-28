import { Shell } from "@bernouy/cms-editor-system-v2";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { PageConfigDetailResponse } from "./editorResources";

export async function loadDocumentConfig(shell: Shell, id: string): Promise<void> {
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
    });
}
