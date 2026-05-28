import { randomUUIDv7 } from "bun";
import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type {
    CmsFilesMetadataRepository, FilesItem, FolderItem, FileItem,
    FilesListOptions, FilesPage, NewFolder, NewFile, ItemPatch,
} from "src/socle/interfaces/CmsFilesMetadataRepository";

/**
 * MongoDB `CmsFilesMetadataRepository`. One collection (`<prefix>filesMeta`),
 * the item `id` stored as `_id`. `collectionPrefix` isolates a tenant's tree
 * in a shared Db (same convention as `MongoCmsRepository`). Call `init()` once
 * at boot to create the unique `(parentId, name)` index (filesystem-like:
 * names unique among siblings; a `11000` insert/update error surfaces as a
 * name-clash). The caller owns the `MongoClient` lifecycle.
 */
export type MongoCmsFilesMetadataConfig = { collectionPrefix?: string };

/** Distributive `Omit` over the `FilesItem` union — a plain `Omit<Union, "id">`
 *  would collapse to the common keys and drop the file variant's
 *  `size`/`mimeType`. */
type ToDoc<T> = T extends { id: string } ? Omit<T, "id"> & { _id: string } : never;
type ItemDoc = ToDoc<FilesItem>;

export class MongoCmsFilesMetadata implements CmsFilesMetadataRepository {

    private readonly _prefix: string;

    constructor(private readonly db: Db, config: MongoCmsFilesMetadataConfig = {}) {
        this._prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.col.createIndex({ parentId: 1, name: 1 }, { unique: true });
    }

    private get col(): Collection<ItemDoc> { return this.db.collection<ItemDoc>(this._prefix + "filesMeta"); }

    async listChildren(parentId: string | null, opts: FilesListOptions = {}): Promise<FilesPage> {
        const filter: Record<string, unknown> = { parentId };
        if (opts.accept) filter.type = { $in: opts.accept };
        if (opts.search) filter.name = { $regex: escapeRegex(opts.search), $options: "i" };

        const sort = { [opts.sortBy ?? "name"]: opts.sortOrder === "desc" ? -1 : 1 } as Record<string, 1 | -1>;
        const total = await this.col.countDocuments(filter);

        let cursor = this.col.find(filter).sort(sort);
        if (opts.pagination) cursor = cursor.skip((opts.pagination.page - 1) * opts.pagination.limit).limit(opts.pagination.limit);
        const docs = await cursor.toArray();

        const page  = opts.pagination?.page  ?? 1;
        const limit = opts.pagination?.limit ?? total;
        return { items: docs.map(fromDoc), total, page, limit, hasMore: (page - 1) * limit + docs.length < total };
    }

    async getItem(id: string): Promise<FilesItem | null> {
        const d = await this.col.findOne({ _id: id });
        return d ? fromDoc(d) : null;
    }

    async getItemByPath(path: string): Promise<FilesItem | null> {
        const segments = path.split("/").map(s => s.trim()).filter(Boolean);
        let parentId: string | null = null;
        let doc: ItemDoc | null = null;
        for (const seg of segments) {
            doc = await this.col.findOne({ parentId, name: seg });
            if (!doc) return null;
            parentId = doc._id;
        }
        return doc ? fromDoc(doc) : null;
    }

    async listSubtree(folderId: string): Promise<FilesItem[]> {
        const docs = await this.col.aggregate<ItemDoc>([
            { $match: { _id: folderId } },
            { $graphLookup: { from: this._prefix + "filesMeta", startWith: "$_id", connectFromField: "_id", connectToField: "parentId", as: "d" } },
            { $unwind: "$d" },
            { $replaceRoot: { newRoot: "$d" } },
        ]).toArray();
        return docs.map(fromDoc);
    }

    async createFolder(input: NewFolder): Promise<FolderItem> {
        await this._assertParent(input.parentId);
        const now = new Date();
        const doc: ItemDoc = { _id: randomUUIDv7(), type: "folder", name: input.name, parentId: input.parentId, createdAt: now, updatedAt: now };
        await this._insert(doc);
        return fromDoc(doc) as FolderItem;
    }

    async createFile(input: NewFile): Promise<FileItem> {
        await this._assertParent(input.parentId);
        const now = new Date();
        const doc: ItemDoc = { _id: randomUUIDv7(), type: "file", name: input.name, parentId: input.parentId, size: input.size, mimeType: input.mimeType, createdAt: now, updatedAt: now };
        await this._insert(doc);
        return fromDoc(doc) as FileItem;
    }

    async updateItem(id: string, patch: ItemPatch): Promise<FilesItem | null> {
        const cur = await this.col.findOne({ _id: id });
        if (!cur) return null;
        if (patch.parentId !== undefined && patch.parentId !== cur.parentId) {
            await this._assertParent(patch.parentId);
            if (cur.type === "folder" && patch.parentId !== null) await this._assertNotIntoOwnSubtree(id, patch.parentId);
        }
        const $set: Partial<ItemDoc> = { updatedAt: new Date() };
        if (patch.name !== undefined) $set.name = patch.name;
        if (patch.parentId !== undefined) $set.parentId = patch.parentId;
        try {
            const d = await this.col.findOneAndUpdate({ _id: id }, { $set }, { returnDocument: "after" });
            return d ? fromDoc(d) : null;
        } catch (e) { throw clashOr(e); }
    }

    async deleteItem(id: string, opts: { recursive?: boolean } = {}): Promise<{ deletedFileIds: string[] }> {
        const item = await this.col.findOne({ _id: id });
        if (!item) return { deletedFileIds: [] };
        if (item.type === "file") {
            await this.col.deleteOne({ _id: id });
            return { deletedFileIds: [id] };
        }
        const subtree = await this.listSubtree(id);
        if (subtree.length && !opts.recursive) throw new Error("folder not empty");
        await this.col.deleteMany({ _id: { $in: [id, ...subtree.map(s => s.id)] } });
        return { deletedFileIds: subtree.filter(s => s.type === "file").map(s => s.id) };
    }

    private async _insert(doc: ItemDoc): Promise<void> {
        try { await this.col.insertOne(doc as OptionalUnlessRequiredId<ItemDoc>); }
        catch (e) { throw clashOr(e); }
    }

    private async _assertParent(parentId: string | null): Promise<void> {
        if (parentId === null) return;
        const p = await this.col.findOne({ _id: parentId });
        if (!p || p.type !== "folder") throw new Error("destination folder not found");
    }

    private async _assertNotIntoOwnSubtree(folderId: string, targetParentId: string): Promise<void> {
        let cur: string | null = targetParentId;
        while (cur !== null) {
            if (cur === folderId) throw new Error("cannot move a folder into its own subtree");
            cur = (await this.col.findOne({ _id: cur }))?.parentId ?? null;
        }
    }
}

function fromDoc(d: ItemDoc): FilesItem {
    const { _id, ...rest } = d;
    return { id: _id, ...rest } as FilesItem;
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function clashOr(e: unknown): unknown {
    if (e && typeof e === "object" && (e as { code?: number }).code === 11000) {
        return new Error("name already exists in the destination folder");
    }
    return e;
}
