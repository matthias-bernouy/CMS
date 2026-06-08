import type { MediaItem as LocalMediaItem } from "../types";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

/**
 * Filter expressed in the admin-UI's compact vocabulary (`folder` / `image`
 * / `other`). `other` stands in for every non-folder non-image file. Absent
 * filter = fetch everything.
 */
export type LocalTypeFilter = ("folder" | "image" | "other")[];

/**
 * Wire shape of a file-tree item as returned by `/api/files*`. Mirrors the
 * server `FilesItem`, but `createdAt`/`updatedAt` arrive as JSON strings.
 */
export type FilesItem = {
    id:        string;
    name:      string;
    parentId:  string | null;
    type:      "folder" | "file";
    createdAt: string;
    updatedAt: string;
    size?:     number;
    mimeType?: string;
};

export type FilesPage = {
    items:   FilesItem[];
    total:   number;
    page:    number;
    limit:   number;
    hasMore: boolean;
};

/** Concat-ready base for every files endpoint, e.g. `/cms/api/files`. */
export function filesBase(): string {
    return `${getMetaBasePath()}/api/files`;
}

/**
 * Public, opaque-id bytes URL for a file, e.g. `/cms/.cms/files/by-id/<id>`.
 * This is the form STORED in content: the id is immutable per content and stable
 * across rename/move, so the URL caches forever (served `immutable`) and survives
 * a media-tree reorg. Served by both Control (admin-guarded) and Delivery.
 */
export function cmsFilesIdUrl(id: string): string {
    return `${getMetaBasePath()}/.cms/files/by-id/${encodeURIComponent(id)}`;
}

export function toLocal(item: FilesItem): LocalMediaItem {
    const isImage = item.type === "file" && (item.mimeType?.startsWith("image/") ?? false);
    const local: LocalMediaItem = {
        id:    item.id,
        type:  item.type === "folder" ? "folder" : isImage ? "image" : "other",
        label: item.name,
    };
    if (item.type === "file") {
        local.mimetype    = item.mimeType;
        local.size        = item.size;
        // Address bytes by opaque id (immutable + rename-proof). The grid
        // thumbnail, detail preview, copy-URL, and what gets stored in content
        // all read this one field.
        local.absoluteURL = cmsFilesIdUrl(item.id);
    }
    return local;
}
