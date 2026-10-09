import type { Collection, Db } from "mongodb";
import type {
    CollectionMigrationActive,
    CollectionMigrationAudit,
    CollectionMigrationPageChange,
    CollectionMigrationProgress,
    CollectionMigrationRecord,
    CollectionMigrationStorage,
} from "../interfaces";
import {
    digestText,
    fromMigrationDocument,
    fromMigrationPageDocument,
    type MigrationAuditDocument,
    type MigrationDocument,
    type MigrationPageDocument,
    toMigrationDocument,
    toMigrationAuditDocument,
    toMigrationPageDocument,
} from "./documents";
import { cleanupStagedMigrations, pruneTerminalMigrations, resumeMigrationPruning } from "./retention";
import { migrationAudit } from "../storage/audit";
import { MongoCollectionMigrationWriteFence } from "./writeFence";
import { listMigrationAudits, migrationProgress } from "./queries";

export class MongoCollectionMigrationStorage implements CollectionMigrationStorage {
    private readonly records: Collection<MigrationDocument>;
    private readonly pages: Collection<MigrationPageDocument>;
    private readonly audits: Collection<MigrationAuditDocument>;
    private readonly fence: MongoCollectionMigrationWriteFence;

    constructor(db: Db) {
        this.records = db.collection("collection_migrations");
        this.pages = db.collection("collection_migration_pages");
        this.audits = db.collection("collection_migration_audits");
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
            this.pages.createIndex(
                { stagedAt: 1 },
                { expireAfterSeconds: 86_400, name: "collection_migration_pages_staged_ttl" },
            ),
            this.audits.createIndex({ siteId: 1, updatedAt: -1 }, { name: "collection_migration_audits_site" }),
            this.fence.init(),
        ]);
        await resumeMigrationPruning(this.records, this.pages);
        await cleanupStagedMigrations(this.records, this.pages);
    }

    async get(id: string): Promise<CollectionMigrationRecord | null> {
        const document = await this.records.findOne({ _id: id, ready: true, pruning: { $ne: true } });
        return document ? fromMigrationDocument(document) : null;
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
        return migrationProgress(this.records, this.pages, this.audits, id);
    }

    async listAudits(siteId: string, limit: number): Promise<readonly CollectionMigrationAudit[]> {
        return listMigrationAudits(this.audits, siteId, limit);
    }

    claimMaintenance(siteId: string, migrationId: string): Promise<boolean> {
        return this.fence.claimMaintenance(siteId, migrationId);
    }

    assertMaintenance(siteId: string, migrationId: string): Promise<void> {
        return this.fence.assertMaintenance(siteId, migrationId);
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

    async stagePageBatch(id: string, start: number, changes: readonly CollectionMigrationPageChange[]): Promise<void> {
        if (!changes.length) {
            return;
        }
        const pages = changes.map((change, offset) => toMigrationPageDocument(id, start + offset, change, new Date()));
        await this.pages.insertMany(pages, { ordered: true });
    }

    async discardPageStage(id: string): Promise<void> {
        if (!(await this.records.findOne({ _id: id, ready: true }, { projection: { _id: 1 } }))) {
            await this.pages.deleteMany({ migrationId: id, stagedAt: { $exists: true } });
        }
    }

    async create(record: CollectionMigrationRecord): Promise<boolean> {
        if ((await count(this.pages, { migrationId: record.id })) !== record.pageCount) {
            throw new Error("Collection migration page count is inconsistent");
        }
        const { active: _active, ...staged } = toMigrationDocument(record);
        try {
            await this.records.insertOne({ ...staged, ready: false });
            const finalized = await this.pages.updateMany(
                { migrationId: record.id, stagedAt: { $exists: true } },
                { $set: {}, $unset: { stagedAt: "" } },
            );
            if (finalized.matchedCount !== record.pageCount) {
                throw new Error("Collection migration staged page count changed during activation");
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

    async getPageBatch(id: string, start: number, limit: number): Promise<readonly CollectionMigrationPageChange[]> {
        if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
            throw new TypeError("Invalid collection migration page range");
        }
        const documents = await this.pages
            .find({ migrationId: id, index: { $gte: start, $lt: start + limit } })
            .sort({ index: 1 })
            .toArray();
        return documents.map(fromMigrationPageDocument);
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
        await pruneTerminalMigrations(this.records, this.pages, this.audits, siteId, keep);
    }

    async archiveTerminal(record: CollectionMigrationRecord): Promise<void> {
        const audit = toMigrationAuditDocument(migrationAudit(record));
        await this.audits.replaceOne({ _id: audit._id }, audit, { upsert: true });
    }
}

async function count<T extends { _id: string }>(collection: Collection<T>, filter: object): Promise<number> {
    if (typeof collection.countDocuments === "function") {
        return collection.countDocuments(filter);
    }
    return (await collection.find(filter).toArray()).length;
}
