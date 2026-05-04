import type { StorageProvider } from "../../exports/StorageProvider";
import type { StoredFile } from "../../interfaces/entities/StoredFile";
import { mimeToFileType } from "./mimeToFileType";
import { inspectImage } from "./inspectImage";
import { buildPublicURL } from "./helpers";

export type BuildStoredFileInput = {
    fileId:         string;
    bucketId:       string;
    name:           string;
    parentFolderID: string | null;
    mimeType:       string;
    storagePath:    string;
    size:           number;
    sha256:         string;
    publicPath?:    string;
};

/**
 * Assembles a `StoredFile` after the blob has been written. Discriminates
 * the union on `type`: images get their dimensions inspected (`image-size`
 * lib) and fall back to `"other"` if parsing fails — we never claim
 * dimensions we don't have.
 */
export async function buildStoredFile(provider: StorageProvider, input: BuildStoredFileInput): Promise<StoredFile> {
    const fileType = mimeToFileType(input.mimeType);
    const publicKey = input.publicPath ?? input.storagePath;
    const now = new Date();

    const base = {
        id:             input.fileId,
        bucketId:       input.bucketId,
        name:           input.name,
        parentFolderID: input.parentFolderID,
        createdAt:      now,
        updatedAt:      now,
        size:           input.size,
        mimeType:       input.mimeType,
        absoluteURL:    buildPublicURL(provider, input.bucketId, publicKey),
        sha256:         input.sha256,
        storagePath:    input.storagePath,
        ...(input.publicPath !== undefined ? { publicPath: input.publicPath } : {}),
    };

    if (fileType === "image") {
        const dims = await inspectImage(provider, input.bucketId, input.storagePath);
        return dims
            ? { ...base, type: "image", imageInfo: dims }
            : { ...base, type: "other" };
    }
    return { ...base, type: fileType };
}
