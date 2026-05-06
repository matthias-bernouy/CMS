import type { StorageProvider } from "../../exports/StorageProvider";
import type { CDNItem, CDNItemsPage, CDNGetItemsOptions } from "@bernouy/core";

/**
 * Lists folders + files at a given level. Slice-scope simplification: the
 * folders+files merge is done in memory (no DB-side aggregation). Folders
 * come first by convention, then files. Pagination is applied AFTER the
 * merge so page numbers stay stable as content grows.
 *
 * `accept` shortcuts the corresponding repo call when a kind is excluded —
 * passing `["folder"]` skips the file query entirely.
 */
export async function listItems(
    provider: StorageProvider,
    bucketId: string,
    opts: CDNGetItemsOptions,
): Promise<CDNItemsPage> {
    const parentFolderID = opts.folderID ?? null;
    const page  = Math.max(1, opts.pagination?.page  ?? 1);
    const limit = Math.max(1, opts.pagination?.limit ?? 50);

    const sortBy    = opts.sortBy    ?? "createdAt";
    const sortOrder = opts.sortOrder ?? "desc";
    const search    = opts.search;

    const wantFolders = !opts.accept || opts.accept.includes("folder");
    const wantAnyFile = !opts.accept || opts.accept.some((t) => t !== "folder");

    const folderSortBy = sortBy === "size" ? "createdAt" : sortBy;

    const [folders, files] = await Promise.all([
        wantFolders
            ? provider.storedFolderRepo.list({ bucketId, parentFolderID, sortBy: folderSortBy, sortOrder, search, page: 1, limit: 1000 })
            : Promise.resolve({ items: [], total: 0 }),
        wantAnyFile
            ? provider.storedFileRepo  .list({ bucketId, parentFolderID, sortBy,            sortOrder, search, page: 1, limit: 1000 })
            : Promise.resolve({ items: [], total: 0 }),
    ]);

    const acceptedFiles = opts.accept
        ? files.items.filter((f) => opts.accept!.includes(f.type))
        : files.items;

    const merged: CDNItem[] = [...folders.items, ...acceptedFiles];
    const total = folders.total + acceptedFiles.length;

    const start = (page - 1) * limit;
    const items = merged.slice(start, start + limit);

    return {
        items,
        total,
        page,
        limit,
        hasMore: start + items.length < total,
    };
}
