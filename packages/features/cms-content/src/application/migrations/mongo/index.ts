import type { Collection, Db } from "mongodb";
import type {
    CollectionMigrationActive,
    CollectionMigrationPageChange,
    CollectionMigrationProgress,
    CollectionMigrationRecord,
    CollectionMigrationStorage,
} from "../interfaces";
import {
    digestText,
    fromMigrationPageDocument,
    type MigrationDocument,
    type MigrationPageDocument,
    TERMINAL_MIGRATION_STATUSES,
    toMigrationDocument,
    toMigrationPageDocument,
} from "./documents";
import { MongoCollectionMigrationWriteFence } from "./writeFence";

const STAGED_TTL_MS = 10 * 60_000;

export class MongoCollectionMigrationStorage implements CollectionMigrationStorage {
    private readonly records: Collection<MigrationDocument>;
    private readonly pages: Collection<MigrationPageDocument>;
    private readonly fence: MongoCollectionMigrationWriteFence;

    constructor(db: Db) {
        this.records = db.collection("collection_migrations");
        this.pages = db.collection("collection_migration_pages");
        this.fence = new MongoCollectionMigrationWriteFence(
            this.records,
            db.collection("collection_migration_maintenance"),
            db.collection("collection_migration_write_permits"),
        );
    }

    async init(): Promise<void> {
        await Promise.all([
            this.records.createIndex(
                { siteId: 1, active: 1 },
                {
                    unique: true,
                    partialFilterExpression: { active: true, ready: true },
                    name: "one_active_collection_migration_per_site",
                },
            ),
            this.pages.createIndex({ migrationId: 1, index: 1 }, { name: "collection_migration_pages_order" }),
            this.pages.createIndex({ migrationId: 1, state: 1 }, { name: "collection_migration_pages_state" }),
            this.fence.init(),
        ]);
        const staged = await this.records
            .find({ ready: false, createdAt: { $lt: new Date(Date.now() - STAGED_TTL_MS).toISOString() } })
            .toArray();
        const ids = staged.map(({ _id }) => _id);
        if (ids.length) {
            await this.pages.deleteMany({ migrationId: { $in: ids } });
            await this.records.deleteMany({ _id: { $in: ids }, ready: false });
        }
    }

    async get(id: string): Promise<CollectionMigrationRecord | null> {
        return this.hydrate(await this.records.findOne({ _id: id, ready: true }));
    }

    async getActive(siteId: string): Promise<CollectionMigrationActive | null> {
        const document = await this.records.findOne(
            { siteId, active: true, ready: true },
            { projection: { _id: 1, siteId: 1, status: 1, updatedAt: 1 } },
        );
        return document
            ? { id: document._id, siteId: document.siteId, status: document.status, updatedAt: document.updatedAt }
            : null;
    }

    async getProgress(id: string): Promise<CollectionMigrationProgress | null> {
        const document = await this.records.findOne(
            { _id: id, ready: true },
            { projection: { _id: 1, siteId: 1, status: 1, createdAt: 1, updatedAt: 1, error: 1, pageCount: 1 } },
        );
        if (!document) {
            return null;
        }
        const [pendingPages, appliedPages, rolledBackPages] = await Promise.all([
            count(this.pages, { migrationId: id, state: "pending" }),
            count(this.pages, { migrationId: id, state: "applied" }),
            count(this.pages, { migrationId: id, state: "rolled-back" }),
        ]);
        return {
            id: document._id,
            siteId: document.siteId,
            status: document.status,
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
            ...(document.error ? { error: document.error } : {}),
            totalPages: document.pageCount,
            pendingPages,
            appliedPages,
            rolledBackPages,
        };
    }

    claimMaintenance(siteId: string, migrationId: string): Promise<boolean> {
        return this.fence.claimMaintenance(siteId, migrationId);
    }

    yieldMaintenance(siteId: string, migrationId: string): Promise<void> {
        return this.fence.yieldMaintenance(siteId, migrationId);
    }

    releaseMaintenance(siteId: string, migrationId: string): Promise<void> {
        return this.fence.releaseMaintenance(siteId, migrationId);
    }

    withWrite<T>(siteId: string, operation: () => Promise<T>): Promise<T> {
        return this.fence.withWrite(siteId, operation);
    }

    async create(record: CollectionMigrationRecord): Promise<boolean> {
        const pages = record.pages.map((change, index) => toMigrationPageDocument(record.id, index, change));
        const { active: _active, ...staged } = toMigrationDocument(record);
        try {
            await this.records.insertOne({ ...staged, ready: false });
            if (pages.length) {
                await this.pages.insertMany(pages, { ordered: true });
            }
            const activated = await this.records.updateOne(
                { _id: record.id, ready: false },
                { $set: { ready: true, active: true } },
            );
            if (activated.matchedCount !== 1) {
                throw new Error("Collection migration journal could not be activated");
            }
            return true;
        } catch (error) {
            await this.pages.deleteMany({ migrationId: record.id });
            await this.records.deleteOne({ _id: record.id, ready: false });
            if ((error as { code?: number }).code === 11000) {
                return false;
            }
            throw error;
        }
    }

    async replace(id: string, expectedRevision: number, next: CollectionMigrationRecord): Promise<boolean> {
        const result = await this.records.replaceOne(
            { _id: id, revision: expectedRevision, ready: true },
            toMigrationDocument(next),
        );
        return result.modifiedCount === 1;
    }

    async replacePage(
        id: string,
        pageId: string,
        expectedState: CollectionMigrationPageChange["state"],
        next: CollectionMigrationPageChange,
    ): Promise<boolean> {
        const snapshot = structuredClone(next);
        const result = await this.pages.updateOne(
            { _id: `${id}:${pageId}`, migrationId: id, pageId, state: expectedState },
            { $set: { ...snapshot, afterContentDigest: digestText(snapshot.afterContent) } },
        );
        return result.matchedCount === 1;
    }

    async pruneTerminal(siteId: string, keep: number): Promise<void> {
        const terminal = await this.records
            .find({ siteId, ready: true, status: { $in: [...TERMINAL_MIGRATION_STATUSES] } })
            .sort({ updatedAt: -1 })
            .toArray();
        const ids = terminal.slice(Math.max(0, keep)).map(({ _id }) => _id);
        if (ids.length) {
            await this.records.deleteMany({ _id: { $in: ids }, status: { $in: [...TERMINAL_MIGRATION_STATUSES] } });
            await this.pages.deleteMany({ migrationId: { $in: ids } });
        }
    }

    private async hydrate(document: MigrationDocument | null): Promise<CollectionMigrationRecord | null> {
        if (!document) {
            return null;
        }
        const pages = await this.pages.find({ migrationId: document._id }).sort({ index: 1 }).toArray();
        if (pages.length !== document.pageCount) {
            throw new Error(`Incomplete collection migration journal: ${document._id}`);
        }
        const { _id, active: _active, ready: _ready, pageCount: _pageCount, ...record } = structuredClone(document);
        return { id: _id, ...record, pages: pages.map(fromMigrationPageDocument) };
    }
}

async function count<T extends { _id: string }>(collection: Collection<T>, filter: object): Promise<number> {
    if (typeof collection.countDocuments === "function") {
        return collection.countDocuments(filter);
    }
    return (await collection.find(filter).toArray()).length;
}
