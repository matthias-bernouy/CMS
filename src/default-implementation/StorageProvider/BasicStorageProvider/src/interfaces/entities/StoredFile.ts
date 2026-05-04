import type { FileMetadata } from "../../../../../../interfaces/CDN";

export type StoredFile = FileMetadata & {
    bucketId: string;
    /** Hex-encoded SHA-256, computed server-side during upload streaming. */
    sha256: string;
    /** Internal path on disk; never exposed to clients. */
    storagePath: string;
};
