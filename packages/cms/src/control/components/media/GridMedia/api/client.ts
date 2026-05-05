import type { MediaItem as LocalMediaItem } from "../types";
import type { CDNItem as SocleMediaItem, CDN } from "@bernouy/core";
/**
 * Filter expressed in the admin-UI's compact vocabulary (`folder` / `image`
 * / `other`). `other` stands in for every non-folder non-image file type in
 * socle (video, audio, pdf, document, text, archive, other). Absent filter
 * = fetch everything.
 */
export type LocalTypeFilter = ("folder" | "image" | "other")[];

export function media(): CDN {
    const m = window._cms?.Media;
    if (!m) {
        throw new Error(
            "window._cms.Media is not available. Check that the admin page loaded /<basePath>/_cms/media.js.",
        );
    }
    return m;
}

export function toLocal(item: SocleMediaItem): LocalMediaItem {
    const local: LocalMediaItem = {
        id:    item.id,
        type:  item.type === "folder" ? "folder" : item.type === "image" ? "image" : "other",
        label: item.name,
    };
    if (item.type !== "folder") {
        local.mimetype    = item.mimeType;
        local.size        = item.size;
        local.absoluteURL = item.absoluteURL;
    }
    if (item.type === "image") {
        local.width  = item.imageInfo.width;
        local.height = item.imageInfo.height;
    }
    return local;
}
