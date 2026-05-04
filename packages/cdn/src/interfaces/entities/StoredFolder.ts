import type { FolderMetadata } from "@bernouy/core";

export type StoredFolder = FolderMetadata & {
    bucketId: string;
};
