import { validateUpgradeIntent, sameUpgradeIntent } from "./validation";
import type { Collection, Db } from "mongodb";
import type { SiteUpgradeStorage, SiteUpgradeIntent, SiteUpgradeActive } from "./interfaces";
import { MongoSiteWriteFence } from "./mongoFence";
import { randomUUID } from "node:crypto";

type IntentDocument = SiteUpgradeIntent<unknown> & { _id: string; active: boolean; ready: boolean };
type ResourceRevisionDocument = { _id: string; revision: string };

/** Durable release-switch intents contain pins and explicit values, never Page snapshots. */
export class MongoSiteUpgradeStorage extends MongoSiteWriteFence implements SiteUpgradeStorage {
    private readonly records: Collection<IntentDocument>;
    private readonly database: Db;
    constructor(db: Db) {
        const records = db.collection<IntentDocument>("site_upgrades");
        super(
            async (siteId) => Boolean(await records.findOne({ siteId, active: true })),
            db.collection("site_upgrade_maintenance"),
            db.collection("site_write_permits"),
            {},
            async (siteId) => {
                await db
                    .collection<ResourceRevisionDocument>("site_resource_revisions")
                    .replaceOne({ _id: siteId }, { revision: randomUUID() }, { upsert: true });
            },
        );
        this.records = records;
        this.database = db;
    }

    /** Four bounded indexed reads, without opening Content or loading any business resources. */
    async readResourceRevision(siteId: string): Promise<string> {
        const revisions = this.database.collection<ResourceRevisionDocument>("site_resource_revisions");
        const before = await revisions.findOne({ _id: siteId });
        // Both checks stay between the ordered revision reads. They are independent.
        // Even expired permits block reuse: a paused writer is not necessarily dead.
        const [maintenance, permit] = await Promise.all([
            this.database
                .collection<{ _id: string; maintenance?: unknown }>("site_upgrade_maintenance")
                .findOne({ _id: siteId }, { projection: { maintenance: 1 } }),
            this.database
                .collection("site_write_permits")
                .findOne({ siteId, affectsResources: { $ne: false } }, { projection: { _id: 1 } }),
        ]);
        const after = await revisions.findOne({ _id: siteId });
        for (const value of [before, after]) {
            if (value && (typeof value.revision !== "string" || !/^[0-9a-f-]{36}$/u.test(value.revision))) {
                throw new TypeError("Invalid persisted resource revision");
            }
        }
        // No clock exists before the first write. Refuse cache reuse, without repairing state.
        return before && after?.revision === before.revision && !maintenance?.maintenance && !permit
            ? before.revision
            : randomUUID();
    }
    override async init(): Promise<void> {
        await super.init();
        await this.records.createIndex(
            { siteId: 1 },
            { unique: true, partialFilterExpression: { active: true }, name: "collection_upgrade_active_site" },
        );
    }
    async begin<T>(intent: SiteUpgradeIntent<T>): Promise<SiteUpgradeIntent<T>> {
        validateUpgradeIntent(intent);
        const existing = await this.get<T>(intent.siteId, intent.id, intent.kind);
        if (existing) {
            if (!sameUpgradeIntent(existing, intent)) {
                throw new TypeError("Upgrade intent identity is immutable");
            }
            return existing;
        }
        try {
            await this.records.insertOne({ ...structuredClone(intent), _id: intent.id, active: true, ready: true });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const concurrent = await this.get<T>(intent.siteId, intent.id, intent.kind);
            if (concurrent) {
                if (!sameUpgradeIntent(concurrent, intent)) {
                    throw new TypeError("Upgrade intent identity is immutable");
                }
                return concurrent;
            }
            throw Object.assign(new Error("Another site upgrade is pending"), { status: 423 });
        }
        return structuredClone(intent);
    }
    async get<T>(siteId: string, id: string, kind: string): Promise<SiteUpgradeIntent<T> | null> {
        return project<T>(await this.records.findOne({ _id: id, siteId, kind }));
    }
    async getActive(siteId: string): Promise<SiteUpgradeActive | null> {
        return project(await this.records.findOne({ siteId, active: true }, { projection: { payload: 0 } }));
    }
    async transition(
        siteId: string,
        id: string,
        from: SiteUpgradeActive["status"],
        to: SiteUpgradeActive["status"],
    ): Promise<void> {
        const result = await this.records.updateOne(
            { _id: id, siteId, status: from },
            { $set: { status: to, active: ["prepared", "applying"].includes(to) } },
        );
        if (result.matchedCount !== 1) {
            throw Object.assign(new Error("Site upgrade intent changed"), { status: 409 });
        }
    }
}
function project<T>(document: IntentDocument | null): SiteUpgradeIntent<T> | null {
    if (!document) {
        return null;
    }
    const { _id, active, ready, ...intent } = document;
    return structuredClone(intent) as SiteUpgradeIntent<T>;
}
