import type { FolderMetadata } from "../../../../../../interfaces/CDN";

export type StoredFolder = FolderMetadata & {
    bucketId: string;
};
