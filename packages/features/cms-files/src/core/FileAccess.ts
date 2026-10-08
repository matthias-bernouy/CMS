import type { BlobStore } from "@bernouy/blob-store";
import { CmsFilesError, createFileAccess, validFileAccess } from "cms-files/core/credentials";
import { NamespaceAuthority } from "cms-files/core/NamespaceAuthority";
import { parseRange } from "cms-files/core/streams";
import { boundedText } from "cms-files/core/validation";
import type { CmsFileRead, CmsFilesStore, FileRecord, FileReference, FileVariant } from "cms-files/interfaces";

export class FileAccess {
    readonly #signingKey: Uint8Array;

    constructor(
        private readonly store: CmsFilesStore,
        private readonly blobs: BlobStore,
        signingKey: Uint8Array,
        private readonly publicBaseUrl: string,
        private readonly now: () => Date,
        private readonly namespaces: NamespaceAuthority,
    ) {
        this.#signingKey = new Uint8Array(signingKey);
    }

    async sign(input: {
        namespaceId: string;
        namespaceKey: string;
        fileId: string;
        generation: string;
        expiresInSeconds: number;
    }): Promise<{ url: string; expiresAt: string }> {
        const authority = await this.namespaces.authorize(input.namespaceKey, "files.sign");
        if (authority.namespaceId !== boundedText(input.namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const file = await this.requiredFile(input.fileId, input.generation);
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
        const expiresAt = new Date(this.now().getTime() + input.expiresInSeconds * 1000);
        const access = await createFileAccess(file, expiresAt, this.#signingKey);
        return { url: this.fileUrl(file) + "?access=" + access, expiresAt: expiresAt.toISOString() };
    }

    async authorizeReadMetadata(file: FileRecord, input: { access?: string; namespaceKey?: string }): Promise<void> {
        if (file.visibility === "public" || (await validFileAccess(file, input.access, this.#signingKey, this.now()))) {
            return;
        }
        if (input.namespaceKey) {
            const authority = await this.namespaces.authorize(input.namespaceKey, "files.read");
            if (authority.namespaceId === file.namespaceId) {
                return;
            }
        }
        throw new CmsFilesError("NOT_AUTHORIZED", 403);
    }

    async requiredFile(fileId: string, generation: string): Promise<FileRecord> {
        const file = await this.store.getFile(boundedText(fileId, 128), boundedText(generation, 128));
        if (!file) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        return file;
    }

    reference(file: FileRecord): FileReference {
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
            url: file.visibility === "public" ? this.fileUrl(file) : "",
            ...(file.variants?.length
                ? {
                      variants: file.variants.map((variant) => ({
                          width: variant.width,
                          height: variant.height,
                          profile: variant.profile,
                          mimeType: variant.mimeType,
                          url: this.variantUrl(file, variant.width),
                      })),
                  }
                : {}),
        };
    }

    representationUrl(file: FileRecord, profile: string, width: number): string {
        return `${this.fileUrl(file)}/representations/${encodeURIComponent(profile)}/${width}.webp`;
    }

    async read(
        file: FileRecord,
        access?: string,
        rangeHeader?: string,
        ifRange?: string,
        variant?: FileVariant,
    ): Promise<CmsFileRead> {
        if (file.visibility === "private" && !(await validFileAccess(file, access, this.#signingKey, this.now()))) {
            throw new CmsFilesError("NOT_AUTHORIZED", 403);
        }
        const size = variant?.size ?? file.size;
        const etag = '"' + file.generation + (variant ? `-${variant.profile}-w${variant.width}` : "") + '"';
        const range = rangeHeader && (!ifRange || ifRange === etag) ? parseRange(rangeHeader, size) : undefined;
        const stream = await this.blobs.get(variant?.blobKey ?? file.blobKey, range ? { range } : undefined);
        if (!stream) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        return {
            file,
            stream,
            status: range ? 206 : 200,
            contentLength: range ? range.end - range.start + 1 : size,
            ...(range ? { contentRange: "bytes " + range.start + "-" + range.end + "/" + size } : {}),
            etag,
            cacheControl: file.visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
            contentType: variant?.mimeType ?? file.mimeType,
        };
    }

    async deleteRecord(file: FileRecord): Promise<void> {
        await this.store.deleteFile(file.id, file.generation);
        await this.blobs.delete(file.blobKey);
        await Promise.all(file.variants?.map((variant) => this.blobs.delete(variant.blobKey)) ?? []);
    }

    private fileUrl(file: FileRecord): string {
        return `${this.publicBaseUrl}/.cms/call/ulvia.cms.files/files/${encodeURIComponent(file.id)}/${encodeURIComponent(file.generation)}`;
    }

    private variantUrl(file: FileRecord, width: number): string {
        const variant = file.variants?.find((candidate) => candidate.width === width);
        return variant ? this.representationUrl(file, variant.profile, variant.width) : this.fileUrl(file);
    }
}
