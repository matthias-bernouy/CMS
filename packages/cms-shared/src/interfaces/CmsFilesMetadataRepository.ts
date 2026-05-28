/**
 * Per-tenant file-tree metadata — folders + file records — owned by the CMS
 * itself (its own DB), NOT an external bucket service.
 *
 * Hierarchical: every item carries a `parentId` (`null` = tree root). An item's
 * readable path ("images/hero.png") is DERIVED from its `name` + the chain of
 * parents; it is never stored. So renaming or moving an item is a single-row
 * update and never touches the bytes.
 *
 * Metadata-only. The bytes live in a separate blob layer (wired later); they
 * are keyed by the item's `id` — `id` IS the blob key, so this repo stores no
 * blob pointer. `createFile` is what the (future) upload flow calls once it has
 * stored the bytes under the new id.
 *
 * Names are unique among the direct children of a folder (filesystem-like):
 * `createFolder` / `createFile` / `updateItem` reject a clash in the
 * destination folder.
 */

export type FilesItemType = "folder" | "file";

type BaseItem = {
    id:        string;            // opaque, stable; also the blob key for files
    name:      string;
    parentId:  string | null;     // null = tree root
    createdAt: Date;
    updatedAt: Date;
};

export type FolderItem = BaseItem & { type: "folder" };

export type FileItem = BaseItem & {
    type:     "file";
    size:     number;             // bytes
    mimeType: string;
};

export type FilesItem = FolderItem | FileItem;

export type FilesListOptions = {
    /** Restrict to folders and/or files. Default: both. */
    accept?:     FilesItemType[];
    /** Case-insensitive substring match on `name`. */
    search?:     string;
    sortBy?:     "name" | "createdAt" | "updatedAt" | "size";
    sortOrder?:  "asc" | "desc";
    /** 1-based. Omit for the full (unbounded) listing. */
    pagination?: { page: number; limit: number };
};

export type FilesPage = {
    items:   FilesItem[];
    total:   number;
    page:    number;
    limit:   number;
    hasMore: boolean;
};

export type NewFolder = { name: string; parentId: string | null };
export type NewFile   = { name: string; parentId: string | null; size: number; mimeType: string };
export type ItemPatch = { name?: string; parentId?: string | null };

export interface CmsFilesMetadataRepository {

    // READ
    /** Direct children of a folder (`null` = root), filtered / sorted / paged. */
    listChildren(parentId: string | null, opts?: FilesListOptions): Promise<FilesPage>;
    getItem(id: string): Promise<FilesItem | null>;
    /** Resolve a readable path ("images/hero.png") to its item — for `p9r pull/push`. */
    getItemByPath(path: string): Promise<FilesItem | null>;
    /** Every descendant of a folder (any depth) — for recursive delete + blob cleanup. */
    listSubtree(folderId: string): Promise<FilesItem[]>;

    // WRITE
    createFolder(input: NewFolder): Promise<FolderItem>;
    /** Persist a file record. The upload flow calls this AFTER storing the bytes
     *  under the returned `id`. */
    createFile(input: NewFile): Promise<FileItem>;
    /** Rename and/or move. Rejects a name clash in the destination, or moving a
     *  folder into its own subtree. Returns `null` when `id` is unknown. */
    updateItem(id: string, patch: ItemPatch): Promise<FilesItem | null>;
    /** Delete an item. `recursive` is required to delete a non-empty folder.
     *  Returns the ids of the deleted FILES so the caller can purge their bytes. */
    deleteItem(id: string, opts?: { recursive?: boolean }): Promise<{ deletedFileIds: string[] }>;

}
