import type { StoredFile } from "../entities/StoredFile";

export type StoredFileListOptions = {
    bucketId: string;
    /** `null` = root. */
    parentFolderID: string | null;
    /** Case-insensitive substring on `name`. */
    search?: string;
    sortBy?: "name" | "createdAt" | "updatedAt" | "size";
    sortOrder?: "asc" | "desc";
    /** 1-based offset pagination. */
    page?: number;
    limit?: number;
};

export type StoredFileListResult = {
    items: StoredFile[];
    total: number;
};

export interface StoredFileRepository {
    create(file: StoredFile): Promise<void>;
    get(id: string): Promise<StoredFile | null>;
    /** Unicité primitive — `(bucketId, parentFolderID, name)` is unique. */
    getByName(bucketId: string, parentFolderID: string | null, name: string): Promise<StoredFile | null>;
    /** Lookup by the public slug — unique within a bucket when set, sparse otherwise. */
    getByPublicPath(bucketId: string, publicPath: string): Promise<StoredFile | null>;
    update(id: string, patch: Partial<Pick<StoredFile, "name" | "parentFolderID" | "updatedAt" | "publicPath" | "absoluteURL">>): Promise<void>;
    delete(id: string): Promise<void>;
    /** Bulk delete used by bucket cascade. Returns the row count removed. */
    deleteByBucket(bucketId: string): Promise<number>;
    list(opts: StoredFileListOptions): Promise<StoredFileListResult>;
    /** Aggregate over a bucket — used by quota checks. */
    sumSize(bucketId: string): Promise<{ totalSize: number; fileCount: number }>;
}
