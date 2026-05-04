import type { StoredFolder } from "../entities/StoredFolder";

export type StoredFolderListOptions = {
    bucketId: string;
    /** `null` = root. */
    parentFolderID: string | null;
    /** Case-insensitive substring on `name`. */
    search?: string;
    sortBy?: "name" | "createdAt" | "updatedAt";
    sortOrder?: "asc" | "desc";
    /** 1-based offset pagination. */
    page?: number;
    limit?: number;
};

export type StoredFolderListResult = {
    items: StoredFolder[];
    total: number;
};

export interface StoredFolderRepository {
    create(folder: StoredFolder): Promise<void>;
    get(id: string): Promise<StoredFolder | null>;
    /** Unicité primitive — `(bucketId, parentFolderID, name)` is unique. */
    getByName(bucketId: string, parentFolderID: string | null, name: string): Promise<StoredFolder | null>;
    update(id: string, patch: Partial<Pick<StoredFolder, "name" | "parentFolderID" | "updatedAt" | "itemCount">>): Promise<void>;
    delete(id: string): Promise<void>;
    list(opts: StoredFolderListOptions): Promise<StoredFolderListResult>;
}
