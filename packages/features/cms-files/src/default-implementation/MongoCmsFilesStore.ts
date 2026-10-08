import type {
    CmsFilesStore,
    FileRecord,
    NamespaceKeyRecord,
    NamespaceRecord,
    UploadRecord,
} from "cms-files/interfaces";
import type { Collection, Db } from "mongodb";

type Document =
    | ({ _id: string; kind: "namespace" } & NamespaceRecord)
    | ({ _id: string; kind: "key" } & NamespaceKeyRecord)
    | ({ _id: string; kind: "upload" } & UploadRecord)
    | ({ _id: string; kind: "file" } & FileRecord);

export class MongoCmsFilesStore implements CmsFilesStore {
    readonly #documents: Collection<Document>;

    constructor(db: Db) {
        this.#documents = db.collection<Document>("cms_files_provider");
    }

    async init(): Promise<void> {
        await this.#documents.createIndex({ kind: 1, namespaceId: 1 });
    }

    async createNamespace(namespace: NamespaceRecord, key: NamespaceKeyRecord): Promise<void> {
        await this.#documents.insertMany([
            { ...namespace, _id: "namespace:" + namespace.id, kind: "namespace" },
            { ...key, _id: "key:" + key.id, kind: "key" },
        ]);
    }

    getNamespace(id: string): Promise<NamespaceRecord | null> {
        return this.#get("namespace:" + id, "namespace");
    }

    async deleteNamespace(id: string): Promise<void> {
        await this.#documents.deleteMany({ $or: [{ _id: "namespace:" + id }, { kind: "key", namespaceId: id }] });
    }

    getKey(id: string): Promise<NamespaceKeyRecord | null> {
        return this.#get("key:" + id, "key");
    }

    async putKey(key: NamespaceKeyRecord): Promise<void> {
        await this.#put("key:" + key.id, "key", key);
    }

    async listKeys(namespaceId: string): Promise<readonly NamespaceKeyRecord[]> {
        const rows = await this.#documents.find({ kind: "key", namespaceId }).toArray();
        return rows.map(documentValue<NamespaceKeyRecord>);
    }

    async putUpload(upload: UploadRecord): Promise<void> {
        await this.#put("upload:" + upload.id, "upload", upload);
    }

    getUpload(id: string): Promise<UploadRecord | null> {
        return this.#get("upload:" + id, "upload");
    }

    async listExpiredUploads(before: string, limit: number): Promise<readonly UploadRecord[]> {
        const rows = await this.#documents
            .find({ kind: "upload", state: { $ne: "completed" }, expiresAt: { $lte: before } })
            .limit(limit)
            .toArray();
        return rows.map(documentValue<UploadRecord>);
    }

    async deleteUpload(id: string): Promise<void> {
        await this.#documents.deleteOne({ _id: "upload:" + id, kind: "upload" });
    }

    async putFile(file: FileRecord): Promise<void> {
        await this.#put(fileKey(file.id, file.generation), "file", file);
    }

    getFile(id: string, generation: string): Promise<FileRecord | null> {
        return this.#get(fileKey(id, generation), "file");
    }

    async getLatestFile(id: string): Promise<FileRecord | null> {
        const row = await this.#documents.find({ kind: "file", id }).sort({ createdAt: -1 }).limit(1).next();
        return row ? documentValue<FileRecord>(row) : null;
    }

    async listFileGenerations(id: string): Promise<readonly FileRecord[]> {
        const rows = await this.#documents.find({ kind: "file", id }).toArray();
        return rows.map(documentValue<FileRecord>);
    }

    async listFiles(namespaceId: string, offset: number, limit: number): Promise<readonly FileRecord[]> {
        const rows = await this.#documents
            .find({ kind: "file", namespaceId })
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .toArray();
        return rows.map(documentValue<FileRecord>);
    }

    async deleteFile(id: string, generation: string): Promise<void> {
        await this.#documents.deleteOne({ _id: fileKey(id, generation), kind: "file" });
    }

    async #get<T>(id: string, kind: Document["kind"]): Promise<T | null> {
        const document = await this.#documents.findOne({ _id: id, kind });
        if (!document) {
            return null;
        }
        const { _id: _ignored, kind: _type, ...value } = document;
        return structuredClone(value) as T;
    }

    async #put<T extends object>(id: string, kind: Document["kind"], value: T): Promise<void> {
        await this.#documents.replaceOne({ _id: id }, { ...value, _id: id, kind } as unknown as Document, {
            upsert: true,
        });
    }
}

function documentValue<T>(document: Document): T {
    const { _id: _ignored, kind: _type, ...value } = document;
    return structuredClone(value) as T;
}

function fileKey(id: string, generation: string): string {
    return "file:" + id + ":" + generation;
}
