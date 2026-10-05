import type { Collection, Db } from "mongodb";
import type {
    CmsFilesMetadataRepository,
    FilesItem,
    FolderItem,
    FileItem,
    FilesListOptions,
    FilesPage,
    NewFolder,
    NewFile,
    ItemPatch,
} from "cms-content/files/interfaces/CmsFilesMetadataRepository";
import {
    fileNameClashOr,
    fromDocument,
    type FilesItemDocument,
} from "cms-content/files/default-implementation/mongo/mongoFilesDocuments";
import {
    findMongoItemByPath,
    listMongoChildren,
    listMongoSubtree,
} from "cms-content/files/default-implementation/mongo/mongoFilesQueries";
import {
    assertMongoMoveOutsideSubtree,
    assertMongoParent,
    createMongoFile,
    createMongoFolder,
} from "cms-content/files/default-implementation/mongo/mongoFilesMutations";

/**
 * MongoDB `CmsFilesMetadataRepository`. One collection (`<prefix>filesMeta`),
 * the item `id` stored as `_id`. `collectionPrefix` isolates a tenant's tree
 * in a shared Db (same convention as `MongoCmsRepository`). Call `init()` once
 * at boot to create the unique `(parentId, name)` index (filesystem-like:
 * names unique among siblings; a `11000` insert/update error surfaces as a
 * name-clash). The caller owns the `MongoClient` lifecycle.
 */
export type MongoCmsFilesMetadataConfig = { collectionPrefix?: string };

export class MongoCmsFilesMetadata implements CmsFilesMetadataRepository {
    private readonly _prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoCmsFilesMetadataConfig = {},
    ) {
        this._prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.col.createIndex({ parentId: 1, name: 1 }, { unique: true });
    }

    private get col(): Collection<FilesItemDocument> {
        return this.db.collection<FilesItemDocument>(this._prefix + "filesMeta");
    }

    async listChildren(parentId: string | null, opts: FilesListOptions = {}): Promise<FilesPage> {
        return listMongoChildren(this.col, parentId, opts);
    }

    async getItem(id: string): Promise<FilesItem | null> {
        const d = await this.col.findOne({ _id: id });
        return d ? fromDocument(d) : null;
    }

    async getItemByPath(path: string): Promise<FilesItem | null> {
        return findMongoItemByPath(this.col, path);
    }

    async listSubtree(folderId: string): Promise<FilesItem[]> {
        return listMongoSubtree(this.col, this._prefix + "filesMeta", folderId);
    }

    async createFolder(input: NewFolder): Promise<FolderItem> {
        return createMongoFolder(this.col, input);
    }

    async createFile(input: NewFile): Promise<FileItem> {
        return createMongoFile(this.col, input);
    }

    async commitFile(
        input: NewFile & { id: string; contentHash: string; blobKey: string },
        expectedBlobKey: string | null,
    ): Promise<FileItem | null> {
        const existing = await this.col.findOne({ _id: input.id });
        if (!existing) {
            if (expectedBlobKey !== null) {
                return null;
            }
            await assertMongoParent(this.col, input.parentId);
            const now = new Date();
            const document: FilesItemDocument = {
                _id: input.id,
                type: "file",
                name: input.name,
                parentId: input.parentId,
                size: input.size,
                mimeType: input.mimeType,
                contentHash: input.contentHash,
                blobKey: input.blobKey,
                createdAt: now,
                updatedAt: now,
            };
            try {
                await this.col.insertOne(document);
                return fromDocument(document) as FileItem;
            } catch (error) {
                const winner = await this.col.findOne({ _id: input.id });
                if (winner?.type === "file" && (winner.blobKey ?? winner._id) === input.blobKey) {
                    return fromDocument(winner) as FileItem;
                }
                throw fileNameClashOr(error);
            }
        }
        if (existing.type !== "file") {
            return null;
        }
        if ((existing.blobKey ?? existing._id) === input.blobKey) {
            return fromDocument(existing) as FileItem;
        }
        if ((existing.blobKey ?? existing._id) !== expectedBlobKey) {
            return null;
        }
        await assertMongoParent(this.col, input.parentId);
        const blobFilter = existing.blobKey
            ? { _id: input.id, blobKey: expectedBlobKey }
            : { _id: input.id, blobKey: { $exists: false } };
        try {
            const document = await this.col.findOneAndUpdate(
                blobFilter,
                {
                    $set: {
                        type: "file",
                        name: input.name,
                        parentId: input.parentId,
                        size: input.size,
                        mimeType: input.mimeType,
                        contentHash: input.contentHash,
                        blobKey: input.blobKey,
                        updatedAt: new Date(),
                    },
                },
                { returnDocument: "after" },
            );
            return document ? (fromDocument(document) as FileItem) : null;
        } catch (error) {
            throw fileNameClashOr(error);
        }
    }

    async updateItem(id: string, patch: ItemPatch): Promise<FilesItem | null> {
        const cur = await this.col.findOne({ _id: id });
        if (!cur) {
            return null;
        }
        if (patch.parentId !== undefined && patch.parentId !== cur.parentId) {
            await assertMongoParent(this.col, patch.parentId);
            if (cur.type === "folder" && patch.parentId !== null) {
                await assertMongoMoveOutsideSubtree(this.col, id, patch.parentId);
            }
        }
        const $set: Partial<FilesItemDocument> = { updatedAt: new Date() };
        if (patch.name !== undefined) {
            $set.name = patch.name;
        }
        if (patch.parentId !== undefined) {
            $set.parentId = patch.parentId;
        }
        try {
            const d = await this.col.findOneAndUpdate({ _id: id }, { $set }, { returnDocument: "after" });
            return d ? fromDocument(d) : null;
        } catch (e) {
            throw fileNameClashOr(e);
        }
    }

    async updateFileContent(
        id: string,
        fields: { size: number; mimeType: string; contentHash: string },
    ): Promise<FileItem | null> {
        const d = await this.col.findOneAndUpdate(
            { _id: id, type: "file" },
            {
                $set: {
                    size: fields.size,
                    mimeType: fields.mimeType,
                    contentHash: fields.contentHash,
                    updatedAt: new Date(),
                },
            },
            { returnDocument: "after" },
        );
        return d ? (fromDocument(d) as FileItem) : null;
    }

    async deleteItem(id: string, opts: { recursive?: boolean } = {}): Promise<{ deletedFileIds: string[] }> {
        const item = await this.col.findOne({ _id: id });
        if (!item) {
            return { deletedFileIds: [] };
        }
        if (item.type === "file") {
            await this.col.deleteOne({ _id: id });
            return { deletedFileIds: [id] };
        }
        const subtree = await this.listSubtree(id);
        if (subtree.length && !opts.recursive) {
            throw new Error("folder not empty");
        }
        await this.col.deleteMany({ _id: { $in: [id, ...subtree.map((s) => s.id)] } });
        return { deletedFileIds: subtree.filter((s) => s.type === "file").map((s) => s.id) };
    }

    async deleteItems(ids: readonly string[]): Promise<void> {
        if (ids.length > 0) {
            await this.col.deleteMany({ _id: { $in: [...ids] } });
        }
    }
}
