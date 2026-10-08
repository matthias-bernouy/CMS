import { CmsFilesError } from "@bernouy/cms-files";

type Visibility = "private" | "public";
type StoredFile = {
    namespaceId: string;
    fileId: string;
    generation: string;
    name: string;
    visibility: Visibility;
    bytes: Uint8Array;
    variants: Map<number, Uint8Array>;
};

export type AlternativeFilesState = {
    namespaces: Map<string, { keys: Map<string, { value: string; revoked: boolean }> }>;
    uploads: Map<
        string,
        {
            namespaceId: string;
            token: string;
            name: string;
            visibility: Visibility;
            size: number;
            bytes?: Uint8Array;
            image: boolean;
        }
    >;
    files: Map<string, StoredFile>;
    access: Map<string, { fileId: string; generation: string; expiresAt: number }>;
};

/** A deliberately small second implementation used only to prove contract replaceability. */
export class AlternativeFilesProvider {
    constructor(
        readonly state: AlternativeFilesState = {
            namespaces: new Map(),
            uploads: new Map(),
            files: new Map(),
            access: new Map(),
        },
        readonly now: () => number = Date.now,
    ) {}

    async createNamespace() {
        const namespaceId = "alt_ns_" + crypto.randomUUID();
        const keyId = "alt_key_" + crypto.randomUUID();
        const namespaceKey = keyId + "." + crypto.randomUUID();
        this.state.namespaces.set(namespaceId, { keys: new Map([[keyId, { value: namespaceKey, revoked: false }]]) });
        return { namespaceId, keyId, namespaceKey };
    }

    async createNamespaceKey(input: { namespaceId: string; namespaceKey: string }) {
        this.authorize(input.namespaceId, input.namespaceKey);
        const keyId = "alt_key_" + crypto.randomUUID();
        const namespaceKey = keyId + "." + crypto.randomUUID();
        this.state.namespaces.get(input.namespaceId)!.keys.set(keyId, { value: namespaceKey, revoked: false });
        return { keyId, namespaceKey };
    }

    async revokeNamespaceKey(namespaceId: string, namespaceKey: string, keyId: string): Promise<void> {
        this.authorize(namespaceId, namespaceKey);
        const key = this.state.namespaces.get(namespaceId)?.keys.get(keyId);
        if (!key) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        key.revoked = true;
    }

    async createUpload(input: {
        namespaceId: string;
        namespaceKey: string;
        filename: string;
        size: number;
        visibility: Visibility;
        imageProfile?: "thumbnail" | "responsive";
    }) {
        this.authorize(input.namespaceId, input.namespaceKey);
        const uploadId = "alt_upload_" + crypto.randomUUID();
        const uploadToken = crypto.randomUUID();
        this.state.uploads.set(uploadId, {
            namespaceId: input.namespaceId,
            token: uploadToken,
            name: input.filename,
            visibility: input.visibility,
            size: input.size,
            image: Boolean(input.imageProfile),
        });
        return {
            uploadId,
            uploadToken,
            expiresAt: new Date(this.now() + 3_600_000).toISOString(),
            maxBytes: 1_000_000,
        };
    }

    async writeUpload(uploadId: string, uploadToken: string, stream: ReadableStream<Uint8Array>): Promise<void> {
        const upload = this.state.uploads.get(uploadId);
        if (!upload || upload.token !== uploadToken) {
            throw new CmsFilesError("NOT_AUTHORIZED", 403);
        }
        const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
        if (bytes.byteLength !== upload.size) {
            throw new CmsFilesError("SIZE_MISMATCH", 409);
        }
        upload.bytes = bytes;
    }

    async completeUpload(namespaceId: string, namespaceKey: string, uploadId: string) {
        this.authorize(namespaceId, namespaceKey);
        const upload = this.state.uploads.get(uploadId);
        if (!upload?.bytes || upload.namespaceId !== namespaceId) {
            throw new CmsFilesError("UPLOAD_NOT_READY", 409);
        }
        const generation = await sha256(upload.bytes);
        const fileId = "alt_file_" + crypto.randomUUID();
        const file: StoredFile = {
            namespaceId,
            fileId,
            generation,
            name: upload.name,
            visibility: upload.visibility,
            bytes: upload.bytes,
            variants: new Map(upload.image ? [[64, upload.bytes]] : []),
        };
        this.state.files.set(fileId, file);
        return this.reference(file);
    }

    async signFile(input: {
        namespaceId: string;
        namespaceKey: string;
        fileId: string;
        generation: string;
        expiresInSeconds: number;
    }) {
        this.authorize(input.namespaceId, input.namespaceKey);
        const file = this.requiredFile(input.fileId, input.generation);
        if (file.namespaceId !== input.namespaceId) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const token = crypto.randomUUID();
        const expiresAt = this.now() + input.expiresInSeconds * 1000;
        this.state.access.set(token, { fileId: file.fileId, generation: file.generation, expiresAt });
        return { url: this.fileUrl(file) + "?access=" + token, expiresAt: new Date(expiresAt).toISOString() };
    }

    async readFile(input: { fileId: string; generation: string; access?: string; range?: string; ifRange?: string }) {
        const file = this.requiredFile(input.fileId, input.generation);
        this.authorizeRead(file, input.access);
        return this.read(file, file.bytes, input.range, input.ifRange, "application/octet-stream");
    }

    async readRepresentation(input: {
        fileId: string;
        generation: string;
        width: number;
        access?: string;
        range?: string;
        ifRange?: string;
    }) {
        const file = this.requiredFile(input.fileId, input.generation);
        this.authorizeRead(file, input.access);
        const bytes = file.variants.get(input.width);
        if (!bytes) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        return this.read(file, bytes, input.range, input.ifRange, "image/webp");
    }

    async deleteFile(namespaceId: string, namespaceKey: string, fileId: string): Promise<void> {
        this.authorize(namespaceId, namespaceKey);
        const file = this.state.files.get(fileId);
        if (!file || file.namespaceId !== namespaceId) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        this.state.files.delete(fileId);
    }

    private authorize(namespaceId: string, value: string): void {
        const keys = this.state.namespaces.get(namespaceId)?.keys;
        if (![...(keys?.values() ?? [])].some((key) => key.value === value && !key.revoked)) {
            throw new CmsFilesError("NOT_AUTHORIZED", 403);
        }
    }

    private authorizeRead(file: StoredFile, access?: string): void {
        if (file.visibility === "public") {
            return;
        }
        const grant = access ? this.state.access.get(access) : undefined;
        if (
            !grant ||
            grant.fileId !== file.fileId ||
            grant.generation !== file.generation ||
            grant.expiresAt <= this.now()
        ) {
            throw new CmsFilesError("NOT_AUTHORIZED", 403);
        }
    }

    private requiredFile(fileId: string, generation: string): StoredFile {
        const file = this.state.files.get(fileId);
        if (!file || file.generation !== generation) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        return file;
    }

    private read(
        file: StoredFile,
        bytes: Uint8Array,
        range: string | undefined,
        ifRange: string | undefined,
        contentType: string,
    ) {
        const etag = '"' + file.generation + '"';
        const match = range && (!ifRange || ifRange === etag) ? /^bytes=(\d+)-(\d+)$/u.exec(range) : null;
        const start = match ? Number(match[1]) : 0;
        const end = match ? Math.min(Number(match[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
        if (range && !match) {
            throw new CmsFilesError("RANGE_NOT_SATISFIABLE", 416, { "content-range": `bytes */${bytes.byteLength}` });
        }
        const body = bytes.slice(start, end + 1);
        return {
            file: this.reference(file),
            stream: new Blob([body]).stream(),
            status: match ? 206 : 200,
            contentLength: body.byteLength,
            ...(match ? { contentRange: `bytes ${start}-${end}/${bytes.byteLength}` } : {}),
            etag,
            cacheControl: file.visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
            contentType,
        };
    }

    private reference(file: StoredFile) {
        return {
            namespaceId: file.namespaceId,
            fileId: file.fileId,
            generation: file.generation,
            name: file.name,
            mimeType: "application/octet-stream",
            size: file.bytes.byteLength,
            visibility: file.visibility,
            url: this.fileUrl(file),
            variants: [...file.variants.keys()].map((width) => ({
                profile: "thumbnail" as const,
                width,
                height: width,
                mimeType: "image/webp" as const,
                url: this.fileUrl(file) + `/representations/thumbnail/${width}.webp`,
            })),
        };
    }

    private fileUrl(file: StoredFile): string {
        return `https://alternative.example/.cms/call/ulvia.cms.files/files/${file.fileId}/${file.generation}`;
    }
}

async function sha256(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
