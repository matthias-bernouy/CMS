import type { MediaItem as LocalMediaItem, BreadcrumbEntry } from "../types";
import type { CDNItem as SocleMediaItem } from "@bernouy/core";
import { media, toLocal, type LocalTypeFilter } from "./client";

export async function fetchItems(folder: string | null, types?: LocalTypeFilter): Promise<LocalMediaItem[]> {
    const res = await media().getItems({
        folderID:   folder ?? undefined,
        accept:     expandAccept(types),
        pagination: { page: 1, limit: 10_000 },
        sortBy:     "name",
    });
    if (!res.ok) return [];

    const items = res.data.items.map(toLocal);
    items.sort((a, b) => {
        if (a.type === "folder" && b.type !== "folder") return -1;
        if (a.type !== "folder" && b.type === "folder") return 1;
        return a.label.localeCompare(b.label);
    });
    return items;
}

function expandAccept(types?: LocalTypeFilter): SocleMediaItem["type"][] {
    const all: SocleMediaItem["type"][] = [
        "folder", "image", "video", "audio", "pdf", "document", "text", "archive", "other",
    ];
    if (!types || types.length === 0) return all;
    const out: SocleMediaItem["type"][] = [];
    if (types.includes("folder")) out.push("folder");
    if (types.includes("image"))  out.push("image");
    if (types.includes("other"))  out.push("video", "audio", "pdf", "document", "text", "archive", "other");
    return out;
}

export async function resolveBreadcrumbTrail(id: string): Promise<BreadcrumbEntry[]> {
    const trail: BreadcrumbEntry[] = [];
    let currentId: string | null = id;
    while (currentId) {
        const res = await media().getItem(currentId);
        if (!res.ok) break;
        const item = res.data;
        trail.unshift({ id: item.id, label: item.name });
        currentId = item.parentFolderID;
    }
    return trail;
}
