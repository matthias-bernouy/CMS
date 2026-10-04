import type { Collection, Db } from "mongodb";
import { createHash } from "node:crypto";
import { migratePageContent } from "./transforms/page";
import type {
    CollectionMigrationPageChange,
    CollectionMigrationActive,
    CollectionMigrationRecord,
    CollectionMigrationStorage,
} from "./interfaces";

type MigrationDocument = Omit<CollectionMigrationRecord, "id" | "pages"> & {
    _id: string;
    active?: true;
    pageCount: number;
};
type MigrationPageDocument = Omit<CollectionMigrationPageChange, "afterContent"> & {
    _id: string;
    migrationId: string;
    pageId: string;
    index: number;
    afterContentDigest: string;
};

const TERMINAL = ["completed", "rolled-back"] as const;

export class MongoCollectionMigrationStorage implements CollectionMigrationStorage {
    private readonly records: Collection<MigrationDocument>;
    private readonly pages: Collection<MigrationPageDocument>;

    constructor(db: Db) {
        this.records = db.collection("collection_migrations");
        this.pages = db.collection("collection_migration_pages");
    }

    async init(): Promise<void> {
        await Promise.all([
            this.records.createIndex(
                { siteId: 1, active: 1 },
                {
                    unique: true,
                    partialFilterExpression: { active: true },
                    name: "one_active_collection_migration_per_site",
                },
            ),
            this.pages.createIndex({ migrationId: 1, index: 1 }, { name: "collection_migration_pages_order" }),
        ]);
    }

    async get(id: string): Promise<CollectionMigrationRecord | null> {
        return this.hydrate(await this.records.findOne({ _id: id }));
    }

    async getActive(siteId: string): Promise<CollectionMigrationActive | null> {
        const document = await this.records.findOne(
            { siteId, active: true },
            { projection: { _id: 1, siteId: 1, status: 1, updatedAt: 1 } },
        );
        return document
            ? { id: document._id, siteId: document.siteId, status: document.status, updatedAt: document.updatedAt }
            : null;
    }

    async create(record: CollectionMigrationRecord): Promise<boolean> {
        const pages = record.pages.map((change, index) => toPageDocument(record.id, index, change));
        try {
            if (pages.length) {
                await this.pages.insertMany(pages, { ordered: true });
            }
            await this.records.insertOne(toDocument(record));
            return true;
        } catch (error) {
            await this.pages.deleteMany({ migrationId: record.id });
            if ((error as { code?: number }).code === 11000) {
                return false;
            }
            throw error;
        }
    }

    async replace(id: string, expectedRevision: number, next: CollectionMigrationRecord): Promise<boolean> {
        const result = await this.records.replaceOne({ _id: id, revision: expectedRevision }, toDocument(next));
        return result.modifiedCount === 1;
    }

    async replacePage(
        id: string,
        pageId: string,
        expectedState: CollectionMigrationPageChange["state"],
        next: CollectionMigrationPageChange,
    ): Promise<boolean> {
        const { afterContent, ...snapshot } = structuredClone(next);
        const result = await this.pages.updateOne(
            { _id: `${id}:${pageId}`, migrationId: id, pageId, state: expectedState },
            { $set: { ...snapshot, afterContentDigest: digestText(afterContent) } },
        );
        return result.matchedCount === 1;
    }

    private async hydrate(document: MigrationDocument | null): Promise<CollectionMigrationRecord | null> {
        if (!document) {
            return null;
        }
        const pageDocuments = await this.pages.find({ migrationId: document._id }).sort({ index: 1 }).toArray();
        if (pageDocuments.length !== document.pageCount) {
            throw new Error(`Incomplete collection migration journal: ${document._id}`);
        }
        const { _id, active: _active, pageCount: _pageCount, ...rest } = structuredClone(document);
        return {
            id: _id,
            ...rest,
            pages: pageDocuments.map((page) => fromPageDocument(page, rest.operationGroups)),
        };
    }
}

function toDocument(record: CollectionMigrationRecord): MigrationDocument {
    const { id, pages, ...rest } = structuredClone(record);
    return {
        _id: id,
        ...rest,
        pageCount: pages.length,
        ...(TERMINAL.includes(record.status as (typeof TERMINAL)[number]) ? {} : { active: true }),
    };
}

function toPageDocument(
    migrationId: string,
    index: number,
    change: CollectionMigrationPageChange,
): MigrationPageDocument {
    const { afterContent, ...snapshot } = structuredClone(change);
    return {
        _id: `${migrationId}:${change.before.id}`,
        migrationId,
        pageId: change.before.id,
        index,
        ...snapshot,
        afterContentDigest: digestText(afterContent),
    };
}

function fromPageDocument(
    document: MigrationPageDocument,
    groups: CollectionMigrationRecord["operationGroups"],
): CollectionMigrationPageChange {
    const {
        _id,
        migrationId: _migrationId,
        pageId: _pageId,
        index: _index,
        afterContentDigest,
        ...snapshot
    } = structuredClone(document);
    let afterContent = snapshot.before.content;
    for (const group of groups) {
        afterContent = migratePageContent(afterContent, group.operations, group.collectionId).content;
    }
    if (digestText(afterContent) !== afterContentDigest) {
        throw new Error(`Collection migration page snapshot failed its digest: ${_id}`);
    }
    return { ...snapshot, afterContent };
}

function digestText(value: string): string {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
