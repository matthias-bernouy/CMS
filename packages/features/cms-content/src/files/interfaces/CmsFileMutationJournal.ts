import type { NewFile } from "cms-content/files/interfaces/CmsFilesMetadataRepository";

export type FileWriteMutation = Readonly<{
    id: string;
    kind: "write";
    resourceId: string;
    previousBlobKey: string | null;
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
    begin(operation: CmsFileMutation): Promise<boolean>;
    find(resourceId: string): Promise<CmsFileMutation | null>;
    list(limit?: number): Promise<readonly CmsFileMutation[]>;
    complete(id: string): Promise<void>;
}
