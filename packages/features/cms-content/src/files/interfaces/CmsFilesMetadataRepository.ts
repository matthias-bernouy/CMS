/**
 * Per-tenant file-tree metadata — folders + file records — owned by the CMS
 * itself (its own DB), NOT an external bucket service.
 *
 * Hierarchical: every item carries a `parentId` (`null` = tree root). An item's
 * readable path ("images/hero.png") is DERIVED from its `name` + the chain of
 * parents; it is never stored. So renaming or moving an item is a single-row
 * update and never touches the bytes.
 *
 * Metadata-only. Bytes live in a separate blob layer. Legacy records use the
 * item id as their blob key; current writes publish an immutable `blobKey`
 * pointer through the recoverable lifecycle journal.
 *
 * Names are unique among the direct children of a folder (filesystem-like):
 * `createFolder` / `createFile` / `updateItem` reject a clash in the
 * destination folder.
 */

export type FilesItemType = "folder" | "file";

type BaseItem = {
    id: string; // opaque and stable; legacy files also use it as their blob key
    /** Monotonic concurrency token for metadata and published-byte changes. */
    revision: number;
    name: string;
    parentId: string | null; // null = tree root
    createdAt: Date;
    updatedAt: Date;
};

export type FolderItem = BaseItem & { type: "folder" };

export type FileItem = BaseItem & {
    type: "file";
    size: number; // bytes
    mimeType: string;
    /** SHA-256 hex of the bytes, used for derivative identity and reconciliation. */
    contentHash?: string;
    /** Fingerprint of bytes, size and MIME used by immutable HTTP URLs. */
    representationVersion?: string;
    /** Immutable/generation-qualified key of the currently published bytes. Legacy records fall back to `id`. */
    blobKey?: string;
};

export type FilesItem = FolderItem | FileItem;

export type FilesListOptions = {
    /** Restrict to folders and/or files. Default: both. */
    accept?: FilesItemType[];
    /** Case-insensitive substring match on `name`. */
    search?: string;
    sortBy?: "name" | "createdAt" | "updatedAt" | "size";
    sortOrder?: "asc" | "desc";
    /** 1-based. Omit for the full (unbounded) listing. */
    pagination?: { page: number; limit: number };
};

export type FilesPage = {
    items: FilesItem[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
};

export type NewFolder = { name: string; parentId: string | null };
export type NewFile = {
    name: string;
    parentId: string | null;
    size: number;
    mimeType: string;
    /** Optional caller-supplied id, used VERBATIM as the item's id. The CLI push
     *  passes the dev registry uuid here so dev and remote agree on every file's
     *  id (immutable `by-id` URLs survive the push). When supplied, `createFile`
     *  UPSERTS (a re-push updates in place instead of duplicating). UI uploads
     *  omit it → a fresh id is minted. */
    id?: string;
    /** sha256-hex of the bytes, supplied by the upload flow (which sees them).
     *  `localFs` ignores it — it derives the hash from disk via its registry. */
    contentHash?: string;
    blobKey?: string;
};
export type ItemPatch = { name?: string; parentId?: string | null };

/** Lookup in the public author library; visibility is independent of page publication. */
export interface PublicFileMetadataLookup {
    getItem(id: string): Promise<FilesItem | null>;
    /** Resolve a readable path ("images/hero.png") to its item for resource import/export. */
    getItemByPath(path: string): Promise<FilesItem | null>;
}

export interface CmsFilesMetadataRepository extends PublicFileMetadataLookup {
    // READ
    /** Direct children of a folder (`null` = root), filtered / sorted / paged. */
    listChildren(parentId: string | null, opts?: FilesListOptions): Promise<FilesPage>;
    /** Every descendant of a folder (any depth) — for recursive delete + blob cleanup. */
    listSubtree(folderId: string): Promise<FilesItem[]>;

    // WRITE
    createFolder(input: NewFolder): Promise<FolderItem>;
    /** Persist a file record for direct adapters and legacy callers. Recoverable
     * lifecycle writes use `commitFile` instead. */
    createFile(input: NewFile): Promise<FileItem>;
    /** Atomically create or replace the complete file pointer when the current
     * blob key still matches `expectedBlobKey`. `null` means the id must not
     * exist. Repeating an already committed target is idempotent. */
    commitFile(
        input: NewFile & { id: string; contentHash: string; blobKey: string },
        expectedBlobKey: string | null,
    ): Promise<FileItem | null>;
    /** Rename and/or move. Rejects a name clash in the destination, or moving a
     *  folder into its own subtree. Returns `null` when `id` is unknown. */
    updateItem(id: string, patch: ItemPatch, expectedRevision?: number): Promise<FilesItem | null>;
    /** After a file's bytes change IN PLACE (same id), refresh the
     *  content-derived fields (`size`, `mimeType`, `contentHash`) + `updatedAt`,
     *  keeping `name`/`parentId`. Returns `null` if `id` is unknown or a folder. */
    updateFileContent(
        id: string,
        fields: { size: number; mimeType: string; contentHash: string },
        expectedRevision?: number,
    ): Promise<FileItem | null>;
    /** Delete an item. `recursive` is required to delete a non-empty folder.
     *  Returns the ids of the deleted FILES so the caller can purge their bytes. */
    deleteItem(
        id: string,
        opts?: { recursive?: boolean; expectedRevision?: number },
    ): Promise<{ deletedFileIds: string[] }>;
    /** Idempotent internal deletion used by the durable file mutation journal. */
    deleteItems(ids: readonly string[]): Promise<void>;
}
