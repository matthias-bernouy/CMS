import type { StorageProvider } from "../../exports/StorageProvider";
import type { StoredFile } from "../../interfaces/entities/StoredFile";
import { assertValidItemName } from "../validation/content/name";
import { mimeMatches } from "../validation/upload/mimeType";
import { assertValidPublicPath } from "../validation/upload/publicPath";
import { generateId } from "../ids";
import { extractExtension } from "./helpers";
import { buildStoredFile } from "./buildStoredFile";

export type AdminUploadOptions = {
    name:           string;
    mimeType:       string;
    body:           ReadableStream<Uint8Array>;
    parentFolderID: string | null;
    /** Optional URL-safe slug; when set the file is also reachable at
     *  `<publicHost>/<publicPath>` via a symlink in the blob layer. */
    publicPath?:    string;
    /** Optional cap below `bucket.limits.maxFileSize`. Set by the broker via a
     *  pre-signed token to enforce a per-upload ceiling tighter than the
     *  bucket-wide one. */
    maxSize?:       number;
};

/**
 * Direct upload path used by the super-admin UI. Bypasses the pre-signed
 * token flow (frontier C) since the admin guard already authorises the call.
 * The blob is streamed to disk while size + sha256 are computed on the fly,
 * then post-flight checks (size, quota) may roll back the write.
 */
export async function uploadFile(
    provider: StorageProvider,
    bucketId: string,
    opts: AdminUploadOptions,
): Promise<StoredFile> {
    const bucket = await provider.bucketRepo.get(bucketId);
    if (!bucket) throw new Error(`Bucket "${bucketId}" not found.`);

    assertValidItemName(opts.name);
    if (opts.publicPath !== undefined) assertValidPublicPath(opts.publicPath);

    if (!mimeMatches(opts.mimeType, bucket.limits.acceptedMimeTypes)) {
        throw new Error(`unsupported_mime_type: "${opts.mimeType}" not in bucket whitelist.`);
    }

    if (opts.parentFolderID !== null) {
        const parent = await provider.storedFolderRepo.get(opts.parentFolderID);
        if (!parent || parent.bucketId !== bucketId) {
            throw new Error("destination_not_found: parent folder does not exist in this bucket.");
        }
    }

    const folderClash = await provider.storedFolderRepo.getByName(bucketId, opts.parentFolderID, opts.name);
    if (folderClash) throw new Error(`Name "${opts.name}" already taken (folder).`);
    const fileClash = await provider.storedFileRepo.getByName(bucketId, opts.parentFolderID, opts.name);
    if (fileClash) throw new Error(`Name "${opts.name}" already taken (file).`);

    if (opts.publicPath !== undefined) {
        const slugClash = await provider.storedFileRepo.getByPublicPath(bucketId, opts.publicPath);
        if (slugClash) throw new Error(`publicPath "${opts.publicPath}" already taken.`);
    }

    const fileId = generateId();
    const ext = extractExtension(opts.name);
    const storagePath = ext ? `${fileId}.${ext}` : fileId;

    const { size, sha256 } = await provider.blobStorage.write(bucketId, storagePath, opts.body);

    const sizeCap = opts.maxSize !== undefined
        ? Math.min(opts.maxSize, bucket.limits.maxFileSize)
        : bucket.limits.maxFileSize;
    if (size > sizeCap) {
        await provider.blobStorage.delete(bucketId, storagePath).catch(() => {});
        throw new Error(`file_too_large: ${size} > ${sizeCap}.`);
    }

    const usage = await provider.storedFileRepo.sumSize(bucketId);
    if (usage.totalSize + size > bucket.quotas.maxTotalSize || usage.fileCount + 1 > bucket.quotas.maxFileCount) {
        await provider.blobStorage.delete(bucketId, storagePath).catch(() => {});
        throw new Error("quota_exceeded: bucket would exceed its size or file-count quota.");
    }

    const file = await buildStoredFile(provider, {
        fileId, bucketId, storagePath, size, sha256,
        name:           opts.name,
        parentFolderID: opts.parentFolderID,
        mimeType:       opts.mimeType,
        ...(opts.publicPath !== undefined ? { publicPath: opts.publicPath } : {}),
    });

    if (opts.publicPath !== undefined) {
        try {
            await provider.blobStorage.setPublicPath(bucketId, opts.publicPath, storagePath);
        } catch (err) {
            await provider.blobStorage.delete(bucketId, storagePath).catch(() => {});
            throw err;
        }
    }

    await provider.storedFileRepo.create(file);
    return file;
}

