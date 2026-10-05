import type { NewFile } from "cms-content/files/interfaces/CmsFilesMetadataRepository";

export type FileWriteMutation = Readonly<{
    id: string;
    kind: "write";
    resourceId: string;
    previousBlobKey: string | null;
    /** Content-only replacements preserve a concurrent rename or move. */
    preserveLocation?: true;
    target: NewFile & { id: string; contentHash: string; blobKey: string };
    createdAt: string;
}>;

export type FileDeleteMutation = Readonly<{
    id: string;
    kind: "delete";
    resourceId: string;
    itemIds: readonly string[];
    fileIds: readonly string[];
    blobKeys: readonly string[];
    createdAt: string;
}>;

export type CmsFileMutation = FileWriteMutation | FileDeleteMutation;

export interface CmsFileMutationJournal {
    /** Serialize metadata changes that can alter the file tree. The lock must be
     * durable across runtimes and recover after an owner disappears. */
    withTreeWrite<T>(operation: () => Promise<T>): Promise<T>;
    begin(operation: CmsFileMutation): Promise<boolean>;
    find(resourceId: string): Promise<CmsFileMutation | null>;
    list(limit?: number): Promise<readonly CmsFileMutation[]>;
    complete(id: string): Promise<void>;
}
