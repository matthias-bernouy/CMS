import { ReadConcern } from "mongodb";
import type { Db, Collection } from "mongodb";
import type {
    WorkflowInstallation,
    WorkflowInstallationStore,
    WorkflowInstallationSummary,
} from "workflows/interfaces/installations";
import { WorkflowError } from "workflows/core/errors";
import { isResourceId } from "@bernouy/ulvia-contracts/protocol";
import { isCanonicalSemVer } from "@bernouy/ulvia-contracts/compatibility";
type Stored = WorkflowInstallation & { _id: string };
export class MongoWorkflowInstallations implements WorkflowInstallationStore {
    private readonly records: Collection<Stored>;
    constructor(db: Db) {
        const scoped = db.client.db(db.databaseName, {
            writeConcern: { w: "majority", j: true },
            readConcern: new ReadConcern("majority"),
        });
        this.records = scoped.collection("workflow_installations");
    }
    async init() {
        await this.records.createIndex({ state: 1, _id: 1 });
        await this.records.createIndex({ pendingPublication: 1, _id: 1 });
        await this.records.createIndex({ workflowId: 1 }, { unique: true });
        return this;
    }
    async create(record: WorkflowInstallation) {
        try {
            await this.records.insertOne({ _id: record.id, ...record });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const previous = await this.get(record.id);
            if (
                !previous ||
                previous.manifestRef !== record.manifestRef ||
                previous.parametersRef !== record.parametersRef ||
                previous.reference.repositoryId !== record.reference.repositoryId ||
                previous.state !== "installed"
            ) {
                throw new WorkflowError("DEFINITION_CONFLICT");
            }
            return previous;
        }
        return record;
    }
    async get(id: string): Promise<WorkflowInstallation | null> {
        const record = await this.records.findOne({ _id: id }, { maxTimeMS: 2000 });
        return record ? checked(record) : null;
    }
    async list(cursor: string | undefined, limit: number) {
        const rows = await this.records
            .find(cursor ? { _id: { $gt: cursor } } : {}, {
                projection: { manifestRef: 0, parametersRef: 0, administratorId: 0, pendingPublication: 0 },
                maxTimeMS: 2000,
            })
            .sort({ _id: 1 })
            .limit(limit + 1)
            .toArray();
        const items = rows.slice(0, limit).map(({ _id: _id, ...record }) => record as WorkflowInstallationSummary);
        return { items, ...(rows.length > limit ? { nextCursor: rows[limit - 1]!._id } : {}) };
    }
    async pending(limit: number) {
        const rows = await this.records
            .find({ $or: [{ state: "removing" }, { pendingPublication: { $gt: 0 } }] }, { maxTimeMS: 2000 })
            .sort({ _id: 1 })
            .limit(limit)
            .toArray();
        return rows.map(checked);
    }
    async replace(record: WorkflowInstallation, expectedRevision: number) {
        const result = await this.records.replaceOne(
            { _id: record.id, revision: expectedRevision, pendingPublication: null },
            record,
        );
        return result.matchedCount === 1;
    }
    async finishPublication(id: string, revision: number) {
        await this.records.updateOne({ _id: id, pendingPublication: revision }, { $set: { pendingPublication: null } });
    }
    async markPublished(id: string, revision: number) {
        const result = await this.records.updateOne(
            { _id: id, revision, state: "installed", pendingPublication: null },
            { $set: { publishedRevision: revision, pendingPublication: revision } },
        );
        return result.matchedCount === 1;
    }
}
function checked({ _id, ...record }: Stored): WorkflowInstallation {
    if (
        _id !== record.id ||
        !Number.isSafeInteger(record.revision) ||
        record.revision < 1 ||
        !["installed", "removing", "removed"].includes(record.state) ||
        !record.manifestRef ||
        !record.parametersRef ||
        !record.administratorId ||
        !/^installed:[a-f0-9]{64}$/u.test(record.workflowId) ||
        !record.reference ||
        !isResourceId(record.reference.workflowId) ||
        !isCanonicalSemVer(record.reference.version) ||
        !/^sha256:[a-f0-9]{64}$/u.test(record.reference.digest) ||
        !(
            record.publishedRevision === null ||
            (Number.isSafeInteger(record.publishedRevision) && record.publishedRevision > 0)
        ) ||
        !(
            record.pendingPublication === null ||
            (Number.isSafeInteger(record.pendingPublication) &&
                record.pendingPublication === record.revision &&
                record.pendingPublication === record.publishedRevision)
        ) ||
        !Number.isFinite(Date.parse(record.updatedAt))
    ) {
        throw new WorkflowError("CORE_UNAVAILABLE");
    }
    return record;
}
