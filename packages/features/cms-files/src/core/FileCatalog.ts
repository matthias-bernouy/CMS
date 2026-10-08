import { CmsFilesError } from "cms-files/core/credentials";
import { FileAccess } from "cms-files/core/FileAccess";
import { NamespaceAuthority } from "cms-files/core/NamespaceAuthority";
import { boundedText } from "cms-files/core/validation";
import type { CmsFileRead, CmsFilesStore } from "cms-files/interfaces";

export class FileCatalog {
    constructor(
        private readonly store: CmsFilesStore,
        private readonly now: () => Date,
        private readonly namespaces: NamespaceAuthority,
        private readonly access: FileAccess,
    ) {}

    sign(input: Parameters<FileAccess["sign"]>[0]) {
        return this.access.sign(input);
    }

    async list(input: { namespaceId: string; namespaceKey: string; offset?: number; limit?: number }) {
        const authority = await this.namespaces.authorize(input.namespaceKey, "files.read");
        if (authority.namespaceId !== boundedText(input.namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const offset = input.offset ?? 0;
        const limit = input.limit ?? 50;
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
            throw new CmsFilesError("INVALID_INPUT", 422);
        }
        const files = await this.store.listFiles(input.namespaceId, offset, limit);
        return { items: files.map((file) => this.access.reference(file)), offset, limit };
    }

    async get(input: { namespaceId: string; namespaceKey: string; fileId: string; generation?: string }) {
        const authority = await this.namespaces.authorize(input.namespaceKey, "files.read");
        if (authority.namespaceId !== boundedText(input.namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const file = input.generation
            ? await this.access.requiredFile(input.fileId, input.generation)
            : await this.store.getLatestFile(boundedText(input.fileId, 128));
        if (!file || file.namespaceId !== authority.namespaceId) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        return this.access.reference(file);
    }

    async update(input: { namespaceId: string; namespaceKey: string; fileId: string; name: string }) {
        const authority = await this.namespaces.authorize(input.namespaceKey, "files.write");
        const files = await this.store.listFileGenerations(boundedText(input.fileId, 128));
        const file = files[0];
        if (!file || file.namespaceId !== authority.namespaceId || authority.namespaceId !== input.namespaceId) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const name = boundedText(input.name, 255);
        const updatedAt = this.now().toISOString();
        await Promise.all(files.map((candidate) => this.store.putFile({ ...candidate, name, updatedAt })));
        return this.access.reference({ ...file, name, updatedAt });
    }

    async setVisibility(input: {
        namespaceId: string;
        namespaceKey: string;
        fileId: string;
        visibility: "private" | "public";
    }) {
        const authority = await this.namespaces.authorize(input.namespaceKey, "files.publish");
        const files = await this.store.listFileGenerations(boundedText(input.fileId, 128));
        const file = files[0];
        if (!file || file.namespaceId !== authority.namespaceId || authority.namespaceId !== input.namespaceId) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const updatedAt = this.now().toISOString();
        await Promise.all(
            files.map((candidate) => this.store.putFile({ ...candidate, visibility: input.visibility, updatedAt })),
        );
        return this.access.reference({ ...file, visibility: input.visibility, updatedAt });
    }

    async listRepresentations(input: { fileId: string; generation: string; access?: string; namespaceKey?: string }) {
        const file = await this.access.requiredFile(input.fileId, input.generation);
        await this.access.authorizeReadMetadata(file, input);
        return {
            original: this.access.reference(file),
            representations: (file.variants ?? []).map((variant) => ({
                profile: variant.profile,
                width: variant.width,
                height: variant.height,
                mimeType: variant.mimeType,
                url: this.access.representationUrl(file, variant.profile, variant.width),
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
        const file = await this.access.requiredFile(input.fileId, input.generation);
        const variant = file.variants?.find(
            (candidate) => candidate.profile === input.profile && candidate.width === input.width,
        );
        if (!variant) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        return this.access.read(file, input.access, input.range, input.ifRange, variant);
    }

    async signRepresentations(input: Parameters<FileAccess["sign"]>[0]) {
        const signed = await this.access.sign(input);
        const file = await this.access.requiredFile(input.fileId, input.generation);
        const access = new URL(signed.url).searchParams.get("access")!;
        return {
            expiresAt: signed.expiresAt,
            representations: (file.variants ?? []).map((variant) => ({
                profile: variant.profile,
                width: variant.width,
                height: variant.height,
                mimeType: variant.mimeType,
                url: `${this.access.representationUrl(file, variant.profile, variant.width)}?access=${access}`,
            })),
        };
    }

    async read(input: {
        fileId: string;
        generation: string;
        access?: string;
        range?: string;
        ifRange?: string;
    }): Promise<CmsFileRead> {
        const file = await this.access.requiredFile(input.fileId, input.generation);
        return this.access.read(file, input.access, input.range, input.ifRange);
    }

    async delete(namespaceId: string, namespaceKey: string, fileId: string): Promise<void> {
        const authority = await this.namespaces.authorize(namespaceKey, "files.delete");
        if (authority.namespaceId !== boundedText(namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const files = await this.store.listFileGenerations(boundedText(fileId, 128));
        if (files.length === 0) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        await Promise.all(files.map((file) => this.access.deleteRecord(file)));
    }
}
