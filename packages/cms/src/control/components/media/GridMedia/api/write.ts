import { media } from "./client";

export async function renameItem(id: string, label: string): Promise<boolean> {
    const res = await media().updateItem({ id, name: label });
    return res.ok;
}

export async function deleteItem(id: string): Promise<boolean> {
    // Recursive by default so the admin-UI's single "Delete" button stays
    // equivalent to the prior behavior. Providers that can't descend will
    // surface a `folder_not_empty` error and `ok: false` propagates.
    const res = await media().deleteItem({ id, recursive: true });
    return res.ok;
}

export async function createFolder(label: string, parent: string | null): Promise<boolean> {
    const res = await media().createFolder({
        name:           label,
        ...(parent ? { parentFolderID: parent } : {}),
    });
    return res.ok;
}

/**
 * id → object-URL of the just-uploaded File. The CDN edge serves a
 * 404 for a few hundred ms while lsyncd ships the blob from origin, so
 * instead of waiting / retrying we paint the grid from the bytes the
 * browser already holds. Cleared on full page reload; URLs leak only
 * for the lifetime of the admin tab, which is acceptable.
 */
const _localPreview = new Map<string, string>();

export function localPreview(id: string): string | undefined {
    return _localPreview.get(id);
}

export async function uploadFiles(files: FileList, folder: string | null): Promise<void> {
    for (let i = 0; i < files.length; i++) {
        const file = files.item(i);
        if (!file) continue;
        const res = await media().uploadFile({
            data:     file,
            name:     file.name,
            mimeType: file.type || "application/octet-stream",
            size:     file.size,
            ...(folder ? { folderID: folder } : {}),
        });
        if (res.ok) _localPreview.set(res.data.id, URL.createObjectURL(file));
    }
}

/**
 * Socle's `updateItem` only accepts `name` and `parentFolderID`. The old
 * repository contract accepted a free-form metadata bag (`alt`, tags, …);
 * those fields are silently dropped now. Providers that want richer
 * metadata editing should extend their Media class and the admin-UI side
 * of it accordingly.
 */
export async function saveItemMetadata(id: string, data: Record<string, string>): Promise<boolean> {
    const patch: { name?: string; parentFolderID?: string } = {};
    if (typeof data["label"] === "string") patch.name = data["label"];
    if (typeof data["parent"] === "string") patch.parentFolderID = data["parent"];
    if (Object.keys(patch).length === 0) return true;
    const res = await media().updateItem({ id, ...patch });
    return res.ok;
}
