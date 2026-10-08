import type {
    CmsFilesStore,
    FileRecord,
    NamespaceKeyRecord,
    NamespaceRecord,
    UploadRecord,
} from "cms-files/interfaces";

export class InMemoryCmsFilesStore implements CmsFilesStore {
    readonly #namespaces = new Map<string, NamespaceRecord>();
    readonly #keys = new Map<string, NamespaceKeyRecord>();
    readonly #uploads = new Map<string, UploadRecord>();
    readonly #files = new Map<string, FileRecord>();

    async createNamespace(namespace: NamespaceRecord, key: NamespaceKeyRecord): Promise<void> {
        if (this.#namespaces.has(namespace.id) || this.#keys.has(key.id)) {
            throw new TypeError("namespace identity collision");
        }
        this.#namespaces.set(namespace.id, structuredClone(namespace));
        this.#keys.set(key.id, structuredClone(key));
    }

    async getNamespace(id: string): Promise<NamespaceRecord | null> {
        return clone(this.#namespaces.get(id));
    }

    async deleteNamespace(id: string): Promise<void> {
        this.#namespaces.delete(id);
        for (const [keyId, key] of this.#keys) {
            if (key.namespaceId === id) {
                this.#keys.delete(keyId);
            }
        }
    }

    async getKey(id: string): Promise<NamespaceKeyRecord | null> {
        return clone(this.#keys.get(id));
    }

    async putKey(key: NamespaceKeyRecord): Promise<void> {
        this.#keys.set(key.id, structuredClone(key));
    }

    async listKeys(namespaceId: string): Promise<readonly NamespaceKeyRecord[]> {
        return [...this.#keys.values()]
            .filter((key) => key.namespaceId === namespaceId)
            .map((item) => structuredClone(item));
    }

    async putUpload(upload: UploadRecord): Promise<void> {
        this.#uploads.set(upload.id, structuredClone(upload));
    }

    async getUpload(id: string): Promise<UploadRecord | null> {
        return clone(this.#uploads.get(id));
    }

    async listExpiredUploads(before: string, limit: number): Promise<readonly UploadRecord[]> {
        return [...this.#uploads.values()]
            .filter((upload) => upload.state !== "completed" && upload.expiresAt <= before)
            .slice(0, limit)
            .map((item) => structuredClone(item));
    }

    async deleteUpload(id: string): Promise<void> {
        this.#uploads.delete(id);
    }

    async putFile(file: FileRecord): Promise<void> {
        this.#files.set(fileKey(file.id, file.generation), structuredClone(file));
    }

    async getFile(id: string, generation: string): Promise<FileRecord | null> {
        return clone(this.#files.get(fileKey(id, generation)));
    }

    async getLatestFile(id: string): Promise<FileRecord | null> {
        const files = [...this.#files.values()].filter((file) => file.id === id);
        files.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        return clone(files[0]);
    }

    async listFileGenerations(id: string): Promise<readonly FileRecord[]> {
        return [...this.#files.values()].filter((file) => file.id === id).map((file) => structuredClone(file));
    }

    async listFiles(namespaceId: string, offset: number, limit: number): Promise<readonly FileRecord[]> {
        return [...this.#files.values()]
            .filter((file) => file.namespaceId === namespaceId)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .slice(offset, offset + limit)
            .map((item) => structuredClone(item));
    }

    async deleteFile(id: string, generation: string): Promise<void> {
        this.#files.delete(fileKey(id, generation));
    }
}

function fileKey(id: string, generation: string): string {
    return id + "\0" + generation;
}

function clone<T>(value: T | undefined): T | null {
    return value === undefined ? null : structuredClone(value);
}
