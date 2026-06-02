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
    /** Readable tree-path ("logos/hero.png"), present on FILE items only. */
    path?:     string;
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

/** Raw-bytes URL for a file item — usable directly as an `<img>` src. */
export function rawUrl(id: string): string {
    return `${filesBase()}/raw?id=${encodeURIComponent(id)}`;
}

/**
 * Public, path-based bytes URL for a file, e.g. `/cms/.cms/files/logos/hero.png`.
 * Served by both Control (admin-guarded) and Delivery, relative to `basePath`.
 * Each segment is encoded so spaces / accents in names survive.
 */
export function cmsFilesUrl(path: string): string {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    return `${getMetaBasePath()}/.cms/files/${encoded}`;
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
        // Prefer the canonical path-based route; `rawUrl` is a defensive fallback
        // for the (shouldn't-happen) case of a file item without a resolved path.
        local.absoluteURL = item.path ? cmsFilesUrl(item.path) : rawUrl(item.id);
    }
    return local;
}
