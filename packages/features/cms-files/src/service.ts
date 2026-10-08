import type { BlobStore } from "@bernouy/blob-store";
import { detectMediaSignature } from "@bernouy/binary-media";
import { createHash } from "node:crypto";
import {
    authorizeNamespaceKey,
    bytesToBase64Url,
    CmsFilesError,
    credentialId,
    credentialVerifier,
    newCredential,
} from "cms-files/core/credentials";
import type {
    CmsFileRead,
    CmsFilesStore,
    FileDerivativeScheduler,
    FileRecord,
    FileReference,
    FileVariant,
    NamespacePermission,
    UploadRecord,
} from "cms-files/interfaces";

const ALL_PERMISSIONS: readonly NamespacePermission[] = [
    "files.read",
    "files.write",
    "files.delete",
    "files.sign",
    "files.publish",
    "namespace.manage",
];

export interface CmsFilesServiceOptions {
    readonly store: CmsFilesStore;
    readonly blobs: BlobStore;
    readonly signingKey: Uint8Array;
    readonly publicBaseUrl: string;
    readonly maxFileBytes?: number;
    readonly now?: () => Date;
    readonly derivatives?: FileDerivativeScheduler;
    readonly defaultNamespaceQuota?: { readonly maxBytes: number; readonly maxFiles: number };
}

export class CmsFilesService {
    readonly #store: CmsFilesStore;
    readonly #blobs: BlobStore;
    readonly #signingKey: Uint8Array;
    readonly #publicBaseUrl: string;
    readonly #maxFileBytes: number;
    readonly #now: () => Date;
    readonly #derivatives?: FileDerivativeScheduler;
    readonly #defaultNamespaceQuota: { readonly maxBytes: number; readonly maxFiles: number };

    constructor(options: CmsFilesServiceOptions) {
        if (options.signingKey.byteLength < 32) {
            throw new TypeError("cms-files signing key must contain at least 32 bytes");
        }
        this.#store = options.store;
        this.#blobs = options.blobs;
        this.#signingKey = new Uint8Array(options.signingKey);
        this.#publicBaseUrl = options.publicBaseUrl.replace(/\/$/u, "");
        this.#maxFileBytes = options.maxFileBytes ?? 10 * 1024 * 1024 * 1024;
        this.#now = options.now ?? (() => new Date());
        this.#derivatives = options.derivatives;
        this.#defaultNamespaceQuota = options.defaultNamespaceQuota ?? {
            maxBytes: this.#maxFileBytes * 100,
            maxFiles: 100_000,
        };
    }

    async createNamespace(input: {
        name: string;
        defaultVisibility: "private" | "public";
        createdBy: { kind: "administrator" | "provider" | "system"; id: string };
    }): Promise<{
        namespaceId: string;
        keyId: string;
        namespaceKey: string;
    }> {
        const name = boundedText(input.name, 160);
        const namespaceId = "ns_" + crypto.randomUUID();
        const credential = newCredential("nsk");
        const now = this.#now().toISOString();
        await this.#store.createNamespace(
            {
                id: namespaceId,
                name,
                defaultVisibility: input.defaultVisibility,
                createdAt: now,
                createdBy: {
                    kind: input.createdBy.kind,
                    id: boundedText(input.createdBy.id, 256),
                },
                quota: this.#defaultNamespaceQuota,
            },
            {
                id: credential.id,
                namespaceId,
                verifier: await credentialVerifier(credential.value),
                permissions: ALL_PERMISSIONS,
                createdAt: now,
            },
        );
        return { namespaceId, keyId: credential.id, namespaceKey: credential.value };
    }

    async createNamespaceKey(input: {
        namespaceId: string;
        namespaceKey: string;
        permissions: readonly NamespacePermission[];
        expiresAt?: string;
    }): Promise<{ keyId: string; namespaceKey: string }> {
        const authority = await this.#authorize(input.namespaceKey, "namespace.manage");
        if (authority.namespaceId !== boundedText(input.namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const permissions = [...new Set(input.permissions)];
        if (permissions.length === 0 || permissions.some((permission) => !ALL_PERMISSIONS.includes(permission))) {
            throw new CmsFilesError("INVALID_INPUT", 422);
        }
        const expiresAt = input.expiresAt ? validFutureDate(input.expiresAt, this.#now()) : undefined;
        const credential = newCredential("nsk");
        await this.#store.putKey({
            id: credential.id,
            namespaceId: authority.namespaceId,
            verifier: await credentialVerifier(credential.value),
            permissions,
            createdAt: this.#now().toISOString(),
            ...(expiresAt ? { expiresAt } : {}),
        });
        return { keyId: credential.id, namespaceKey: credential.value };
    }

    async getNamespace(namespaceId: string, namespaceKey: string) {
        const authority = await this.#authorize(namespaceKey, "namespace.manage");
        if (authority.namespaceId !== boundedText(namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const namespace = await this.#store.getNamespace(authority.namespaceId);
        if (!namespace) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        return namespace;
    }

    async rotateNamespaceKey(namespaceId: string, namespaceKey: string, keyId: string) {
        const authority = await this.#authorize(namespaceKey, "namespace.manage");
        if (authority.namespaceId !== boundedText(namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const target = await this.#store.getKey(boundedText(keyId, 128));
        if (!target || target.namespaceId !== authority.namespaceId || target.revokedAt) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const replacement = await this.createNamespaceKey({
            namespaceId,
            namespaceKey,
            permissions: target.permissions,
            ...(target.expiresAt ? { expiresAt: target.expiresAt } : {}),
        });
        await this.#store.putKey({ ...target, revokedAt: this.#now().toISOString() });
        return replacement;
    }

    async revokeNamespaceKey(namespaceId: string, namespaceKey: string, keyId: string): Promise<void> {
        const authority = await this.#authorize(namespaceKey, "namespace.manage");
        if (authority.namespaceId !== boundedText(namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const target = await this.#store.getKey(boundedText(keyId, 128));
        if (!target || target.namespaceId !== authority.namespaceId) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        await this.#store.putKey({ ...target, revokedAt: this.#now().toISOString() });
    }

    async deleteNamespace(namespaceId: string, namespaceKey: string): Promise<void> {
        const authority = await this.#authorize(namespaceKey, "namespace.manage");
        if (authority.namespaceId !== boundedText(namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        for (;;) {
            const files = await this.#store.listFiles(namespaceId, 0, 100);
            if (files.length === 0) {
                break;
            }
            await Promise.all(files.map((file) => this.#deleteRecord(file)));
        }
        await this.#store.deleteNamespace(namespaceId);
    }

    async createUpload(input: {
        namespaceId: string;
        namespaceKey: string;
        filename: string;
        size: number;
        mimeType?: string;
        visibility?: "private" | "public";
        imageProfile?: "thumbnail" | "responsive";
    }): Promise<{ uploadId: string; uploadToken: string; expiresAt: string; maxBytes: number }> {
        const authority = await this.#authorize(input.namespaceKey, "files.write");
        if (authority.namespaceId !== boundedText(input.namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const namespace = await this.#store.getNamespace(authority.namespaceId);
        if (!namespace) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        if (!Number.isSafeInteger(input.size) || input.size < 0 || input.size > this.#maxFileBytes) {
            throw new CmsFilesError("INVALID_INPUT", 422);
        }
        const upload = newCredential("upl");
        const createdAt = this.#now();
        const expiresAt = new Date(createdAt.getTime() + 60 * 60 * 1000).toISOString();
        await this.#store.putUpload({
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
        return { uploadId: upload.id, uploadToken: upload.value, expiresAt, maxBytes: this.#maxFileBytes };
    }

    async writeUpload(uploadId: string, uploadToken: string, stream: ReadableStream<Uint8Array>): Promise<void> {
        const tokenUploadId = credentialId(uploadToken, "upl");
        const upload = await this.#store.getUpload(boundedText(uploadId, 128));
        if (
            tokenUploadId !== uploadId ||
            !upload ||
            upload.state !== "pending" ||
            upload.expiresAt <= this.#now().toISOString() ||
            (await credentialVerifier(uploadToken)) !== upload.tokenVerifier
        ) {
            throw new CmsFilesError("NOT_AUTHORIZED", 403);
        }
        const measured = measureStream(stream, upload.expectedSize);
        try {
            const stored = await this.#blobs.put(upload.blobKey, measured.stream);
            const result = await measured.result;
            if (stored.size !== upload.expectedSize || result.size !== upload.expectedSize) {
                throw new CmsFilesError("SIZE_MISMATCH", 409);
            }
            await this.#store.putUpload({
                ...upload,
                state: "uploaded",
                actualSize: result.size,
                contentHash: result.hash,
                ...(result.detectedMimeType ? { detectedMimeType: result.detectedMimeType } : {}),
            });
        } catch (error) {
            await measured.result.catch(() => undefined);
            await this.#blobs.delete(upload.blobKey);
            throw error;
        }
    }

    async completeUpload(namespaceId: string, namespaceKey: string, uploadId: string): Promise<FileReference> {
        const authority = await this.#authorize(namespaceKey, "files.write");
        if (authority.namespaceId !== boundedText(namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const upload = await this.#store.getUpload(boundedText(uploadId, 128));
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
            // Reserve the stable identity before publishing metadata. A retry after a
            // crash between these writes therefore converges on the same file.
            await this.#store.putUpload(reservedUpload);
        }
        const generation = upload.contentHash;
        if (!(await this.#store.getFile(fileId, generation))) {
            await this.#assertQuota(upload.namespaceId, upload.actualSize);
        }
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
            createdAt: this.#now().toISOString(),
            updatedAt: this.#now().toISOString(),
        };
        await this.#store.putFile(file);
        await this.#store.putUpload({ ...reservedUpload, state: "completed" });
        this.#derivatives?.enqueue(file);
        return this.#reference(file);
    }

    async signFile(input: {
        namespaceId: string;
        namespaceKey: string;
        fileId: string;
        generation: string;
        expiresInSeconds: number;
    }): Promise<{ url: string; expiresAt: string }> {
        const authority = await this.#authorize(input.namespaceKey, "files.sign");
        if (authority.namespaceId !== boundedText(input.namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const file = await this.#requiredFile(input.fileId, input.generation);
        if (file.namespaceId !== authority.namespaceId) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        if (
            !Number.isSafeInteger(input.expiresInSeconds) ||
            input.expiresInSeconds < 1 ||
            input.expiresInSeconds > 86400
        ) {
            throw new CmsFilesError("INVALID_INPUT", 422);
        }
        const expiresAt = new Date(this.#now().getTime() + input.expiresInSeconds * 1000);
        const payload = bytesToBase64Url(
            new TextEncoder().encode(
                JSON.stringify({ fileId: file.id, generation: file.generation, exp: expiresAt.getTime() }),
            ),
        );
        const signature = await this.#signature(payload);
        return {
            url: this.#fileUrl(file) + "?access=" + payload + "." + signature,
            expiresAt: expiresAt.toISOString(),
        };
    }

    async listFiles(input: { namespaceId: string; namespaceKey: string; offset?: number; limit?: number }) {
        const authority = await this.#authorize(input.namespaceKey, "files.read");
        if (authority.namespaceId !== boundedText(input.namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const offset = input.offset ?? 0;
        const limit = input.limit ?? 50;
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
            throw new CmsFilesError("INVALID_INPUT", 422);
        }
        const files = await this.#store.listFiles(input.namespaceId, offset, limit);
        return { items: files.map((file) => this.#reference(file)), offset, limit };
    }

    async getFile(input: { namespaceId: string; namespaceKey: string; fileId: string; generation?: string }) {
        const authority = await this.#authorize(input.namespaceKey, "files.read");
        if (authority.namespaceId !== boundedText(input.namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const file = input.generation
            ? await this.#requiredFile(input.fileId, input.generation)
            : await this.#store.getLatestFile(boundedText(input.fileId, 128));
        if (!file || file.namespaceId !== authority.namespaceId) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        return this.#reference(file);
    }

    async updateFile(input: { namespaceId: string; namespaceKey: string; fileId: string; name: string }) {
        const authority = await this.#authorize(input.namespaceKey, "files.write");
        const files = await this.#store.listFileGenerations(boundedText(input.fileId, 128));
        const file = files[0];
        if (!file || file.namespaceId !== authority.namespaceId || authority.namespaceId !== input.namespaceId) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const name = boundedText(input.name, 255);
        const updatedAt = this.#now().toISOString();
        await Promise.all(files.map((candidate) => this.#store.putFile({ ...candidate, name, updatedAt })));
        return this.#reference({ ...file, name, updatedAt });
    }

    async setFileVisibility(input: {
        namespaceId: string;
        namespaceKey: string;
        fileId: string;
        visibility: "private" | "public";
    }) {
        const authority = await this.#authorize(input.namespaceKey, "files.publish");
        const files = await this.#store.listFileGenerations(boundedText(input.fileId, 128));
        const file = files[0];
        if (!file || file.namespaceId !== authority.namespaceId || authority.namespaceId !== input.namespaceId) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const updatedAt = this.#now().toISOString();
        await Promise.all(
            files.map((candidate) => this.#store.putFile({ ...candidate, visibility: input.visibility, updatedAt })),
        );
        return this.#reference({ ...file, visibility: input.visibility, updatedAt });
    }

    async listRepresentations(input: { fileId: string; generation: string; access?: string; namespaceKey?: string }) {
        const file = await this.#requiredFile(input.fileId, input.generation);
        await this.#authorizeReadMetadata(file, input);
        return {
            original: this.#reference(file),
            representations: (file.variants ?? []).map((variant) => ({
                profile: variant.profile,
                width: variant.width,
                height: variant.height,
                mimeType: variant.mimeType,
                url: this.#representationUrl(file, variant.profile, variant.width),
            })),
        };
    }

    async readRepresentation(input: {
        fileId: string;
        generation: string;
        profile: "thumbnail" | "responsive";
        width: number;
        access?: string;
        range?: string;
        ifRange?: string;
    }): Promise<CmsFileRead> {
        const file = await this.#requiredFile(input.fileId, input.generation);
        const variant = file.variants?.find(
            (candidate) => candidate.profile === input.profile && candidate.width === input.width,
        );
        if (!variant) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        return this.#readRecord(file, input.access, input.range, input.ifRange, variant);
    }

    async signRepresentations(input: {
        namespaceId: string;
        namespaceKey: string;
        fileId: string;
        generation: string;
        expiresInSeconds: number;
    }) {
        const signed = await this.signFile(input);
        const file = await this.#requiredFile(input.fileId, input.generation);
        const access = new URL(signed.url).searchParams.get("access")!;
        return {
            expiresAt: signed.expiresAt,
            representations: (file.variants ?? []).map((variant) => ({
                profile: variant.profile,
                width: variant.width,
                height: variant.height,
                mimeType: variant.mimeType,
                url: `${this.#representationUrl(file, variant.profile, variant.width)}?access=${access}`,
            })),
        };
    }

    async readFile(input: {
        fileId: string;
        generation: string;
        access?: string;
        range?: string;
        ifRange?: string;
    }): Promise<CmsFileRead> {
        const file = await this.#requiredFile(input.fileId, input.generation);
        return this.#readRecord(file, input.access, input.range, input.ifRange);
    }

    async #readRecord(
        file: FileRecord,
        access?: string,
        rangeHeader?: string,
        ifRange?: string,
        variant?: FileVariant,
    ): Promise<CmsFileRead> {
        if (file.visibility === "private" && !(await this.#validAccess(file, access))) {
            throw new CmsFilesError("NOT_AUTHORIZED", 403);
        }
        const size = variant?.size ?? file.size;
        const etag = '"' + file.generation + (variant ? `-${variant.profile}-w${variant.width}` : "") + '"';
        const range = rangeHeader && (!ifRange || ifRange === etag) ? parseRange(rangeHeader, size) : undefined;
        const stream = await this.#blobs.get(variant?.blobKey ?? file.blobKey, range ? { range } : undefined);
        if (!stream) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const contentLength = range ? range.end - range.start + 1 : size;
        return {
            file,
            stream,
            status: range ? 206 : 200,
            contentLength,
            ...(range ? { contentRange: "bytes " + range.start + "-" + range.end + "/" + size } : {}),
            etag,
            cacheControl: file.visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
            contentType: variant?.mimeType ?? file.mimeType,
        };
    }

    async deleteFile(namespaceId: string, namespaceKey: string, fileId: string): Promise<void> {
        const authority = await this.#authorize(namespaceKey, "files.delete");
        if (authority.namespaceId !== boundedText(namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const files = await this.#store.listFileGenerations(boundedText(fileId, 128));
        if (files.length === 0) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        await Promise.all(files.map((file) => this.#deleteRecord(file)));
    }

    async #deleteRecord(file: FileRecord): Promise<void> {
        await this.#store.deleteFile(file.id, file.generation);
        await this.#blobs.delete(file.blobKey);
        await Promise.all(file.variants?.map((variant) => this.#blobs.delete(variant.blobKey)) ?? []);
    }

    async cleanupExpiredUploads(limit = 100): Promise<number> {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
            throw new CmsFilesError("INVALID_INPUT", 422);
        }
        const uploads = await this.#store.listExpiredUploads(this.#now().toISOString(), limit);
        await Promise.all(
            uploads.map(async (upload) => {
                const published =
                    upload.fileId && upload.contentHash
                        ? await this.#store.getFile(upload.fileId, upload.contentHash)
                        : null;
                if (!published) {
                    await this.#blobs.delete(upload.blobKey);
                }
                await this.#store.deleteUpload(upload.id);
            }),
        );
        return uploads.length;
    }

    async #authorize(namespaceKey: string, permission: NamespacePermission) {
        const keyId = credentialId(namespaceKey, "nsk");
        return authorizeNamespaceKey(
            namespaceKey,
            await this.#store.getKey(keyId),
            permission,
            this.#now().toISOString(),
        );
    }

    async #authorizeReadMetadata(file: FileRecord, input: { access?: string; namespaceKey?: string }): Promise<void> {
        if (file.visibility === "public" || (await this.#validAccess(file, input.access))) {
            return;
        }
        if (input.namespaceKey) {
            const authority = await this.#authorize(input.namespaceKey, "files.read");
            if (authority.namespaceId === file.namespaceId) {
                return;
            }
        }
        throw new CmsFilesError("NOT_AUTHORIZED", 403);
    }

    async #assertQuota(namespaceId: string, incomingBytes: number): Promise<void> {
        const namespace = await this.#store.getNamespace(namespaceId);
        if (!namespace) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const files = await this.#store.listFiles(namespaceId, 0, namespace.quota.maxFiles + 1);
        const bytes = files.reduce((total, file) => total + file.size, 0);
        if (files.length >= namespace.quota.maxFiles || bytes + incomingBytes > namespace.quota.maxBytes) {
            throw new CmsFilesError("QUOTA_EXCEEDED", 409);
        }
    }

    async #requiredFile(fileId: string, generation: string): Promise<FileRecord> {
        const file = await this.#store.getFile(boundedText(fileId, 128), boundedText(generation, 128));
        if (!file) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        return file;
    }

    #reference(file: FileRecord): FileReference {
        return {
            fileId: file.id,
            generation: file.generation,
            namespaceId: file.namespaceId,
            mimeType: file.mimeType,
            size: file.size,
            visibility: file.visibility,
            name: file.name,
            ...(file.width === undefined ? {} : { width: file.width }),
            ...(file.height === undefined ? {} : { height: file.height }),
            url: file.visibility === "public" ? this.#fileUrl(file) : "",
            ...(file.variants?.length
                ? {
                      variants: file.variants.map((variant) => ({
                          width: variant.width,
                          height: variant.height,
                          profile: variant.profile,
                          mimeType: variant.mimeType,
                          url: this.#variantUrl(file, variant.width),
                      })),
                  }
                : {}),
        };
    }

    #fileUrl(file: FileRecord): string {
        return (
            this.#publicBaseUrl +
            "/.cms/call/ulvia.cms.files/files/" +
            encodeURIComponent(file.id) +
            "/" +
            encodeURIComponent(file.generation)
        );
    }

    #variantUrl(file: FileRecord, width: number): string {
        const variant = file.variants?.find((candidate) => candidate.width === width);
        return variant ? this.#representationUrl(file, variant.profile, variant.width) : this.#fileUrl(file);
    }

    #representationUrl(file: FileRecord, profile: string, width: number): string {
        return `${this.#fileUrl(file)}/representations/${encodeURIComponent(profile)}/${width}.webp`;
    }

    async #signature(payload: string): Promise<string> {
        const key = await crypto.subtle.importKey(
            "raw",
            new Uint8Array(this.#signingKey).buffer as ArrayBuffer,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );
        return bytesToBase64Url(
            new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))),
        );
    }

    async #validAccess(file: FileRecord, access: string | undefined): Promise<boolean> {
        if (!access || access.length > 2048) {
            return false;
        }
        const separator = access.lastIndexOf(".");
        if (separator < 1) {
            return false;
        }
        const payload = access.slice(0, separator);
        if (!(await this.#validSignature(payload, access.slice(separator + 1)))) {
            return false;
        }
        try {
            const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
            return (
                value.fileId === file.id &&
                value.generation === file.generation &&
                typeof value.exp === "number" &&
                value.exp >= this.#now().getTime()
            );
        } catch {
            return false;
        }
    }

    async #validSignature(payload: string, signature: string): Promise<boolean> {
        try {
            const key = await crypto.subtle.importKey(
                "raw",
                new Uint8Array(this.#signingKey).buffer as ArrayBuffer,
                { name: "HMAC", hash: "SHA-256" },
                false,
                ["verify"],
            );
            return crypto.subtle.verify(
                "HMAC",
                key,
                new Uint8Array(Buffer.from(signature, "base64url")),
                new TextEncoder().encode(payload),
            );
        } catch {
            return false;
        }
    }
}

function measureStream(
    source: ReadableStream<Uint8Array>,
    maximum: number,
): {
    stream: ReadableStream<Uint8Array>;
    result: Promise<{ size: number; hash: string; detectedMimeType?: string }>;
} {
    const hash = createHash("sha256");
    let size = 0;
    const prefix: number[] = [];
    let resolve!: (value: { size: number; hash: string; detectedMimeType?: string }) => void;
    let reject!: (error: unknown) => void;
    const result = new Promise<{ size: number; hash: string; detectedMimeType?: string }>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    const reader = source.getReader();
    const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const next = await reader.read();
                if (next.done) {
                    const detectedMimeType = sniffMimeType(new Uint8Array(prefix));
                    resolve({ size, hash: hash.digest("hex"), ...(detectedMimeType ? { detectedMimeType } : {}) });
                    controller.close();
                    return;
                }
                size += next.value.byteLength;
                if (size > maximum) {
                    throw new CmsFilesError("SIZE_MISMATCH", 409);
                }
                hash.update(next.value);
                for (const byte of next.value.slice(0, Math.max(0, 512 - prefix.length))) {
                    prefix.push(byte);
                }
                controller.enqueue(next.value);
            } catch (error) {
                reject(error);
                controller.error(error);
            }
        },
        async cancel(reason) {
            reject(reason);
            await reader.cancel(reason).catch(() => undefined);
        },
    });
    return { stream, result };
}

function sniffMimeType(bytes: Uint8Array): string | undefined {
    return detectMediaSignature(bytes)?.acceptedMediaTypes[0];
}

function parseRange(value: string, size: number): { start: number; end: number } {
    if (size < 1 || value.includes(",")) {
        throw new CmsFilesError("RANGE_NOT_SATISFIABLE", 416, { "content-range": `bytes */${size}` });
    }
    const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
    if (!match || (!match[1] && !match[2])) {
        throw new CmsFilesError("RANGE_NOT_SATISFIABLE", 416, { "content-range": `bytes */${size}` });
    }
    const suffix = !match[1] ? Number(match[2]) : undefined;
    const start = suffix === undefined ? Number(match[1]) : Math.max(0, size - suffix);
    const requestedEnd = match[2] && suffix === undefined ? Number(match[2]) : size - 1;
    const end = Math.min(requestedEnd, size - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= size) {
        throw new CmsFilesError("RANGE_NOT_SATISFIABLE", 416, { "content-range": `bytes */${size}` });
    }
    return { start, end };
}

function boundedText(value: string, maximum: number): string {
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > maximum) {
        throw new CmsFilesError("INVALID_INPUT", 422);
    }
    return value;
}

function normalizeMimeType(value: string): string {
    const normalized = boundedText(value, 255).toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+\/[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(normalized)) {
        throw new CmsFilesError("INVALID_INPUT", 422);
    }
    return normalized;
}

function validFutureDate(value: string, now: Date): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date <= now) {
        throw new CmsFilesError("INVALID_INPUT", 422);
    }
    return date.toISOString();
}
