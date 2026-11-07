import type { BlobStore } from "@bernouy/blob-store";
import { FileAccess } from "cms-files/core/FileAccess";
import { FileCatalog } from "cms-files/core/FileCatalog";
import { NamespaceAuthority } from "cms-files/core/NamespaceAuthority";
import { UploadManager } from "cms-files/core/UploadManager";
import type { CmsFilesStore, FileDerivativeScheduler, NamespacePermission } from "cms-files/interfaces";

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
    readonly #namespaces: NamespaceAuthority;
    readonly #uploads: UploadManager;
    readonly #files: FileCatalog;
    readonly #access: FileAccess;

    constructor(options: CmsFilesServiceOptions) {
        if (options.signingKey.byteLength < 32) {
            throw new TypeError("cms-files signing key must contain at least 32 bytes");
        }
        const now = options.now ?? (() => new Date());
        const maxFileBytes = options.maxFileBytes ?? 10 * 1024 * 1024 * 1024;
        this.#namespaces = new NamespaceAuthority(
            options.store,
            now,
            options.defaultNamespaceQuota ?? { maxBytes: maxFileBytes * 100, maxFiles: 100_000 },
        );
        this.#access = new FileAccess(
            options.store,
            options.blobs,
            options.signingKey,
            options.publicBaseUrl.replace(/\/$/u, ""),
            now,
            this.#namespaces,
        );
        this.#uploads = new UploadManager(
            options.store,
            options.blobs,
            maxFileBytes,
            now,
            this.#namespaces,
            this.#access,
            options.derivatives,
        );
        this.#files = new FileCatalog(options.store, now, this.#namespaces, this.#access);
    }

    createNamespace(input: Parameters<NamespaceAuthority["create"]>[0]) {
        return this.#namespaces.create(input);
    }

    createNamespaceKey(input: {
        namespaceId: string;
        namespaceKey: string;
        permissions: readonly NamespacePermission[];
        expiresAt?: string;
    }) {
        return this.#namespaces.createKey(input);
    }

    getNamespace(namespaceId: string, namespaceKey: string) {
        return this.#namespaces.get(namespaceId, namespaceKey);
    }

    rotateNamespaceKey(namespaceId: string, namespaceKey: string, keyId: string) {
        return this.#namespaces.rotateKey(namespaceId, namespaceKey, keyId);
    }

    revokeNamespaceKey(namespaceId: string, namespaceKey: string, keyId: string) {
        return this.#namespaces.revokeKey(namespaceId, namespaceKey, keyId);
    }

    deleteNamespace(namespaceId: string, namespaceKey: string) {
        return this.#namespaces.delete(namespaceId, namespaceKey, (file) => this.#access.deleteRecord(file));
    }

    createUpload(input: Parameters<UploadManager["create"]>[0]) {
        return this.#uploads.create(input);
    }

    writeUpload(uploadId: string, uploadToken: string, stream: ReadableStream<Uint8Array>) {
        return this.#uploads.write(uploadId, uploadToken, stream);
    }

    completeUpload(namespaceId: string, namespaceKey: string, uploadId: string) {
        return this.#uploads.complete(namespaceId, namespaceKey, uploadId);
    }

    signFile(input: Parameters<FileCatalog["sign"]>[0]) {
        return this.#files.sign(input);
    }

    listFiles(input: Parameters<FileCatalog["list"]>[0]) {
        return this.#files.list(input);
    }

    getFile(input: Parameters<FileCatalog["get"]>[0]) {
        return this.#files.get(input);
    }

    updateFile(input: Parameters<FileCatalog["update"]>[0]) {
        return this.#files.update(input);
    }

    setFileVisibility(input: Parameters<FileCatalog["setVisibility"]>[0]) {
        return this.#files.setVisibility(input);
    }

    listRepresentations(input: Parameters<FileCatalog["listRepresentations"]>[0]) {
        return this.#files.listRepresentations(input);
    }

    readRepresentation(input: Parameters<FileCatalog["readRepresentation"]>[0]) {
        return this.#files.readRepresentation(input);
    }

    signRepresentations(input: Parameters<FileCatalog["signRepresentations"]>[0]) {
        return this.#files.signRepresentations(input);
    }

    readFile(input: Parameters<FileCatalog["read"]>[0]) {
        return this.#files.read(input);
    }

    deleteFile(namespaceId: string, namespaceKey: string, fileId: string) {
        return this.#files.delete(namespaceId, namespaceKey, fileId);
    }

    cleanupExpiredUploads(limit = 100) {
        return this.#uploads.cleanupExpired(limit);
    }
}
