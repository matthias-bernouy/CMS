import type { EditorV2PageConfig } from "@bernouy/cms-editor-system-v2";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { EditorResource } from "./editorResources";
import { resourceLabel } from "./resource";

export async function saveDocument(resource: EditorResource, page: EditorV2PageConfig, content: string): Promise<void> {
    if (resource === "page") {
        await savePage(page, content);
        return;
    }

    await saveTemplate(page, content);
}

export async function deleteDocument(resource: EditorResource, id: string): Promise<void> {
    const response = await fetch(`${getMetaBasePath()}/api/${resource}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
    });

    if (!response.ok) {
        throw new Error(`${resourceLabel(resource)} delete failed with ${response.status}`);
    }
}

async function savePage(page: EditorV2PageConfig, content: string): Promise<void> {
    const response = await fetch(`${getMetaBasePath()}/api/page`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            id: page.id,
            title: page.title,
            path: page.path,
            description: page.description,
            visible: page.published,
            tags: page.tags,
            content,
        }),
    });

    if (!response.ok) {
        throw new Error(`Page save failed with ${response.status}`);
    }
}

async function saveTemplate(page: EditorV2PageConfig, content: string): Promise<void> {
    const response = await fetch(`${getMetaBasePath()}/api/template`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            id: page.id,
            name: page.title,
            category: page.tags[0] ?? "",
            description: page.description,
            content,
        }),
    });

    if (!response.ok) {
        throw new Error(`${resourceLabel("template")} save failed with ${response.status}`);
    }
}
