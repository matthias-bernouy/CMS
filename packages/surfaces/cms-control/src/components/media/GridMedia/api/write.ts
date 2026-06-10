import { filesBase, type FilesItem } from "./client";

export async function renameItem(id: string, label: string): Promise<boolean> {
    const url = new URL(filesBase(), window.location.origin);
    url.searchParams.set("id", id);
    const res = await fetch(url.toString(), {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: label }),
    });
    return res.ok;
}

export async function deleteItem(id: string): Promise<boolean> {
    // Recursive by default so the admin-UI's single "Delete" button stays
    // equivalent to the prior behavior.
    const url = new URL(filesBase(), window.location.origin);
    url.searchParams.set("id", id);
    url.searchParams.set("recursive", "true");
    const res = await fetch(url.toString(), { method: "DELETE" });
    return res.ok;
}

export async function createFolder(label: string, parent: string | null): Promise<boolean> {
    const res = await fetch(`${filesBase()}/folder`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: label, parentId: parent }),
    });
    return res.ok;
}

/**
 * id → object-URL of the just-uploaded File. Painting the grid from the bytes
 * the browser already holds avoids a flash while the blob layer settles.
 * Cleared on full page reload; URLs leak only for the lifetime of the admin
 * tab, which is acceptable.
 */
const _localPreview = new Map<string, string>();

export function localPreview(id: string): string | undefined {
    return _localPreview.get(id);
}

export async function uploadFiles(files: FileList, folder: string | null): Promise<void> {
    for (let i = 0; i < files.length; i++) {
        const file = files.item(i);
        if (!file) continue;
        const form = new FormData();
        form.append("file", file);
        if (folder) form.append("parentId", folder);
        const res = await fetch(`${filesBase()}/upload`, { method: "POST", body: form });
        if (res.ok) {
            const item = (await res.json()) as FilesItem;
            _localPreview.set(item.id, URL.createObjectURL(file));
        }
    }
}

/**
 * Replace a file's BYTES in place, keeping its id/name/location. The stored
 * `by-id` URL is unchanged — only its `?v` content-hash token changes — so every
 * page that references the file updates at once (the endpoint invalidates the
 * affected pages' cache). Repaints the grid from the bytes the browser already
 * holds, since the unchanged URL would otherwise keep showing the cached image.
 */
export async function replaceFileContent(id: string, file: File): Promise<boolean> {
    const form = new FormData();
    form.append("file", file);
    form.append("id", id);
    const res = await fetch(`${filesBase()}/content`, { method: "PUT", body: form });
    if (res.ok) _localPreview.set(id, URL.createObjectURL(file));
    return res.ok;
}

/**
 * The endpoint only accepts `name` and `parentId`. The old repository
 * contract accepted a free-form metadata bag (`alt`, tags, …); those fields
 * are silently dropped now.
 */
export async function saveItemMetadata(id: string, data: Record<string, string>): Promise<boolean> {
    const patch: { name?: string; parentId?: string } = {};
    if (typeof data["label"] === "string") patch.name = data["label"];
    if (typeof data["parent"] === "string") patch.parentId = data["parent"];
    if (Object.keys(patch).length === 0) return true;
    const url = new URL(filesBase(), window.location.origin);
    url.searchParams.set("id", id);
    const res = await fetch(url.toString(), {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(patch),
    });
    return res.ok;
}
