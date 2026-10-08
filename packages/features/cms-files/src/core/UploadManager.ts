import type { BlobStore } from "@bernouy/blob-store";
import { CmsFilesError, credentialId, credentialVerifier, newCredential } from "cms-files/core/credentials";
import { FileAccess } from "cms-files/core/FileAccess";
import { NamespaceAuthority } from "cms-files/core/NamespaceAuthority";
import { measureStream } from "cms-files/core/streams";
import { boundedText, normalizeMimeType } from "cms-files/core/validation";
import type { CmsFilesStore, FileDerivativeScheduler, FileRecord, FileReference } from "cms-files/interfaces";

export class UploadManager {
    constructor(
        private readonly store: CmsFilesStore,
        private readonly blobs: BlobStore,
        private readonly maxFileBytes: number,
        private readonly now: () => Date,
        private readonly namespaces: NamespaceAuthority,
        private readonly access: FileAccess,
        private readonly derivatives?: FileDerivativeScheduler,
    ) {}

    async create(input: {
        namespaceId: string;
        namespaceKey: string;
        filename: string;
        size: number;
        mimeType?: string;
        visibility?: "private" | "public";
        imageProfile?: "thumbnail" | "responsive";
    }): Promise<{ uploadId: string; uploadToken: string; expiresAt: string; maxBytes: number }> {
        const authority = await this.namespaces.authorize(input.namespaceKey, "files.write");
        if (authority.namespaceId !== boundedText(input.namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const namespace = await this.store.getNamespace(authority.namespaceId);
        if (!namespace) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        if (!Number.isSafeInteger(input.size) || input.size < 0 || input.size > this.maxFileBytes) {
            throw new CmsFilesError("INVALID_INPUT", 422);
        }
        const upload = newCredential("upl");
        const createdAt = this.now();
        const expiresAt = new Date(createdAt.getTime() + 60 * 60 * 1000).toISOString();
        await this.store.putUpload({
            id: upload.id,
            namespaceId: authority.namespaceId,
            tokenVerifier: await credentialVerifier(upload.value),
            blobKey: "uploads/" + upload.id,
            name: boundedText(input.filename, 255),
            ...(input.mimeType ? { declaredMimeType: normalizeMimeType(input.mimeType) } : {}),
            expectedSize: input.size,
            visibility: input.visibility ?? namespace.defaultVisibility,
            ...(input.imageProfile ? { imageProfile: input.imageProfile } : {}),
            state: "pending",
            createdAt: createdAt.toISOString(),
            expiresAt,
        });
        return { uploadId: upload.id, uploadToken: upload.value, expiresAt, maxBytes: this.maxFileBytes };
    }

    async write(uploadId: string, uploadToken: string, stream: ReadableStream<Uint8Array>): Promise<void> {
        const tokenUploadId = credentialId(uploadToken, "upl");
        const upload = await this.store.getUpload(boundedText(uploadId, 128));
        if (
            tokenUploadId !== uploadId ||
            !upload ||
            upload.state !== "pending" ||
            upload.expiresAt <= this.now().toISOString() ||
            (await credentialVerifier(uploadToken)) !== upload.tokenVerifier
        ) {
            throw new CmsFilesError("NOT_AUTHORIZED", 403);
        }
        const measured = measureStream(stream, upload.expectedSize);
        try {
            const stored = await this.blobs.put(upload.blobKey, measured.stream);
            const result = await measured.result;
            if (stored.size !== upload.expectedSize || result.size !== upload.expectedSize) {
                throw new CmsFilesError("SIZE_MISMATCH", 409);
            }
            await this.store.putUpload({
                ...upload,
                state: "uploaded",
                actualSize: result.size,
                contentHash: result.hash,
                ...(result.detectedMimeType ? { detectedMimeType: result.detectedMimeType } : {}),
            });
        } catch (error) {
            await measured.result.catch(() => undefined);
            await this.blobs.delete(upload.blobKey);
            throw error;
        }
    }

    async complete(namespaceId: string, namespaceKey: string, uploadId: string): Promise<FileReference> {
        const authority = await this.namespaces.authorize(namespaceKey, "files.write");
        if (authority.namespaceId !== boundedText(namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const upload = await this.store.getUpload(boundedText(uploadId, 128));
        if (
            !upload ||
            upload.namespaceId !== authority.namespaceId ||
            upload.state !== "uploaded" ||
            upload.actualSize === undefined ||
            !upload.contentHash
        ) {
            throw new CmsFilesError("UPLOAD_NOT_READY", 409);
        }
        const fileId = upload.fileId ?? "file_" + crypto.randomUUID();
        const reservedUpload = upload.fileId ? upload : { ...upload, fileId };
        if (!upload.fileId) {
            await this.store.putUpload(reservedUpload);
        }
        const generation = upload.contentHash;
        if (!(await this.store.getFile(fileId, generation))) {
            await this.namespaces.assertQuota(upload.namespaceId, upload.actualSize);
        }
        const now = this.now().toISOString();
        const file: FileRecord = {
            id: fileId,
            namespaceId: upload.namespaceId,
            generation,
            blobKey: upload.blobKey,
            name: upload.name,
            size: upload.actualSize,
            mimeType: upload.detectedMimeType ?? "application/octet-stream",
            contentHash: upload.contentHash,
            visibility: upload.visibility,
            ...(upload.imageProfile ? { imageProfile: upload.imageProfile } : {}),
            createdAt: now,
            updatedAt: now,
        };
        await this.store.putFile(file);
        await this.store.putUpload({ ...reservedUpload, state: "completed" });
        this.derivatives?.enqueue(file);
        return this.access.reference(file);
    }

    async cleanupExpired(limit = 100): Promise<number> {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
            throw new CmsFilesError("INVALID_INPUT", 422);
        }
        const uploads = await this.store.listExpiredUploads(this.now().toISOString(), limit);
        await Promise.all(
            uploads.map(async (upload) => {
                const published =
                    upload.fileId && upload.contentHash
                        ? await this.store.getFile(upload.fileId, upload.contentHash)
                        : null;
                if (!published) {
                    await this.blobs.delete(upload.blobKey);
                }
                await this.store.deleteUpload(upload.id);
            }),
        );
        return uploads.length;
    }
}
