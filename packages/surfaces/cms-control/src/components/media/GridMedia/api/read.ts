import type { MediaItem as LocalMediaItem, BreadcrumbEntry } from "../types";
import { toLocal, filesBase, type LocalTypeFilter, type FilesItem, type FilesPage } from "./client";

export async function fetchItems(folder: string | null, types?: LocalTypeFilter): Promise<LocalMediaItem[]> {
    const url = new URL(filesBase(), window.location.origin);
    if (folder) {
        url.searchParams.set("parentId", folder);
    }
    const accept = expandAccept(types);
    if (accept) {
        url.searchParams.set("accept", accept);
    }
    url.searchParams.set("sortBy", "name");
    url.searchParams.set("limit", "10000");

    const res = await fetch(url.toString());
    if (!res.ok) {
        return [];
    }
    const page = (await res.json()) as FilesPage;

    let items = page.items.map(toLocal);
    // The endpoint only distinguishes `folder` / `file`; the `image` vs
    // `other` split is a client-side concern, so filter on the mapped local
    // type once we've derived it from the mime type.
    if (types && types.length > 0) {
        items = items.filter((i) => types.includes(i.type));
    }
    items.sort((a, b) => {
        if (a.type === "folder" && b.type !== "folder") {
            return -1;
        }
        if (a.type !== "folder" && b.type === "folder") {
            return 1;
        }
        return a.label.localeCompare(b.label);
    });
    return items;
}

/**
 * Maps the local filter to the endpoint's `folder`/`file` accept list. When
 * `image`/`other` are requested we still need files from the server (the
 * mime-type split happens client-side), so both collapse to `file`.
 */
function expandAccept(types?: LocalTypeFilter): string | undefined {
    if (!types || types.length === 0) {
        return undefined;
    }
    const accept = new Set<string>();
    if (types.includes("folder")) {
        accept.add("folder");
    }
    if (types.includes("image") || types.includes("other")) {
        accept.add("file");
    }
    return accept.size > 0 ? [...accept].join(",") : undefined;
}

export async function resolveBreadcrumbTrail(id: string): Promise<BreadcrumbEntry[]> {
    const trail: BreadcrumbEntry[] = [];
    let currentId: string | null = id;
    while (currentId) {
        const url = new URL(`${filesBase()}/item`, window.location.origin);
        url.searchParams.set("id", currentId);
        const res = await fetch(url.toString());
        if (!res.ok) {
            break;
        }
        const item = (await res.json()) as FilesItem;
        trail.unshift({ id: item.id, label: item.name });
        currentId = item.parentId;
    }
    return trail;
}
