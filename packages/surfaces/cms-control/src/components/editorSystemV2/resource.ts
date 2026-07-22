import { Shell } from "@bernouy/cms-editor-system-v2";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { EditorResource } from "./editorResources";

export function currentPageIdentifier(): string | null {
    return new URL(window.location.href).searchParams.get("id");
}

export function shellResource(shell: Shell): EditorResource {
    return shell.getAttribute("resource") === "template" ? "template" : "page";
}

export function listUrl(resource: EditorResource): string {
    return `${getMetaBasePath()}/admin/${resource === "page" ? "pages" : `${resource}s`}`;
}

export function resourceLabel(resource: EditorResource): string {
    return resource[0]!.toUpperCase() + resource.slice(1);
}
