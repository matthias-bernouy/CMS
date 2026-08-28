import type { EditorV2PageConfig } from "@bernouy/cms-editor-system-v2";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

export async function saveDocument(page: EditorV2PageConfig, content: string): Promise<void> {
    const response = await fetch(`${getMetaBasePath()}/api/page/content`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            id: page.id,
            content,
        }),
    });

    if (!response.ok) {
        throw new Error(`Page save failed with ${response.status}`);
    }
}
