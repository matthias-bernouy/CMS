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
        // Bytes are served by the path-based `.cms/files/<path>` route; the server
        // always attaches `path` to file items (see api/files/files.get.ts).
        if (item.path) local.absoluteURL = cmsFilesUrl(item.path);
    }
    return local;
}
