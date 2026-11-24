import { createHash } from "node:crypto";
import type { WorkflowStore, WorkflowRun } from "workflows/interfaces/store";
import type { EventMessage } from "@bernouy/cms-gateway/events";
import { MongoWorkflowRetention } from "./MongoRetention";
import { WorkflowError } from "workflows/core/errors";
type Run = WorkflowRun & { _id: string; discarded?: true; purging?: boolean; purgeAt?: Date; expiresAt?: Date };
export class MongoWorkflowStore extends MongoWorkflowRetention implements WorkflowStore {
    async open() {
        await this.initRetention();
        await this.db.collection("workflow_plans").createIndex({ retired: 1, _id: 1 });
        await this.db.collection("workflow_plans").createIndex({
            "resourceUse.sourceContractId": 1,
            "resourceUse.sourceInstallationId": 1,
            "resourceUse.resources.resourceId": 1,
            retired: 1,
            _id: 1,
        });
        await this.db
            .collection("workflow_runs")
            .createIndex({ "resourceUse.resources.resourceId": 1, "resourceUse.resources.version": 1, status: 1 });
        await this.db.collection("workflow_triggers").createIndex({ workflowId: 1, workflowRevision: 1, state: 1 });
        await this.db.collection("workflow_plans").createIndex({ "eventDefinitions.id": 1, retired: 1 });
        await this.db.collection("workflow_definitions").createIndex({ "publication.eventDefinitions.id": 1 });
        await this.db.collection("workflow_runs").createIndex({ "eventDefinitions.id": 1, status: 1 });

        await this.db.collection("workflow_runs").createIndex({ status: 1, _id: 1 });
        await this.db
            .collection("workflow_definitions")
            .createIndex(
                { _id: 1, "publication.revision": 1 },
                { partialFilterExpression: { "publication.revision": { $exists: true } } },
            );
        await this.db
            .collection<Run>("workflow_runs")
            .createIndex({ status: 1, dueAt: 1, "lease.expiresAt": 1, _id: 1 });
        await this.db.collection<Run>("workflow_runs").createIndex({ workflowId: 1, _id: 1 });
        await this.db.collection("workflow_triggers").createIndex({ state: 1, _id: 1 });
        await this.db.collection("workflow_triggers").createIndex({ subscriptionId: 1 });
    }
    async createRun(record: WorkflowRun) {
        try {
            await this.db.collection<Run>("workflow_runs").insertOne({ _id: record.id, ...record });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const existing = await this.run(record.id);
            if (
                !existing ||
                existing.workflowId !== record.workflowId ||
                existing.workflowRevision !== record.workflowRevision ||
                existing.inputRef !== record.inputRef ||
                existing.administratorId !== record.administratorId
            ) {
                throw new WorkflowError("RUN_CONFLICT");
            }
            await this.values.accept(existing.id);
            return existing;
        }
        await this.values.accept(record.id);
        return record;
    }
    async eventReceipt(deliveryId: string) {
        const row = await this.db
            .collection<Run>("workflow_runs")
            .findOne({ _id: eventRunId(deliveryId) }, { projection: { receipt: 1 }, maxTimeMS: 2000 });
        return row?.receipt?.fingerprint ?? null;
    }
    async acceptEvent(
        event: Pick<EventMessage, "deliveryId">,
        fingerprint: string,
        record: WorkflowRun | null,
    ): Promise<void> {
        const receipt = { deliveryId: event.deliveryId, fingerprint };
        if (record && record.id !== eventRunId(event.deliveryId)) {
            throw new WorkflowError("INVALID_INPUT");
        }
        try {
            await this.db
                .collection<{
                    _id: string;
                    receipt: { deliveryId: string; fingerprint: string };
                    discarded?: true;
                    purging?: boolean;
                    purgeAt?: Date;
                    expiresAt?: Date;
                }>("workflow_runs")
                .insertOne(
                    record
                        ? { _id: record.id, ...record, receipt }
                        : {
                              _id: eventRunId(event.deliveryId),
                              discarded: true,
                              receipt,
                              expiresAt: new Date(Date.now() + 2592000000),
                          },
                );
            if (record) {
                await this.values.accept(record.id);
            }
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            if ((await this.eventReceipt(event.deliveryId)) !== fingerprint) {
                throw new WorkflowError("DELIVERY_CONFLICT");
            }
        }
    }
    async run(id: string): Promise<WorkflowRun | null> {
        const row = await this.db.collection<Run>("workflow_runs").findOne({ _id: id }, { maxTimeMS: 2000 });
        if (!row || row.discarded || row.purging) {
            return null;
        }
        const { _id: _id, purgeAt: _purgeAt, purging: _purging, expiresAt: _expiresAt, ...record } = row;
        return record;
    }
    async runs(cursor: string | undefined, limit: number) {
        const rows = await this.db
            .collection<Run>("workflow_runs")
            .find(
                { discarded: { $ne: true }, purging: { $ne: true }, ...(cursor ? { _id: { $gt: cursor } } : {}) },
                {
                    projection: {
                        id: 1,
                        workflowId: 1,
                        workflowRevision: 1,
                        revision: 1,
                        status: 1,
                        currentStep: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        failureCode: 1,
                        failurePath: 1,
                    },
                    maxTimeMS: 2000,
                },
            )
            .sort({ _id: 1 })
            .limit(limit + 1)
            .toArray();
        return {
            items: rows.slice(0, limit).map(({ _id: _id, ...record }) => record),
            ...(rows.length > limit ? { nextCursor: rows[limit - 1]!._id } : {}),
        };
    }
    async claim(now: number, token: string, expiresAt: number) {
        const row = await this.db.collection<Run>("workflow_runs").findOneAndUpdate(
            {
                status: { $in: ["queued", "waiting", "running"] },
                dueAt: { $lte: now },
                $or: [{ lease: { $exists: false } }, { "lease.expiresAt": { $lte: now } }],
            },
            { $set: { status: "running", lease: { token, expiresAt } }, $inc: { revision: 1 } },
            { sort: { dueAt: 1, _id: 1 }, returnDocument: "after", maxTimeMS: 2000 },
        );
        if (!row || row.discarded || row.purging) {
            return null;
        }
        const { _id: _id, purgeAt: _purgeAt, purging: _purging, expiresAt: _expiresAt, ...record } = row;
        return record;
    }
    async renew(id: string, token: string, now: number, expiresAt: number) {
        const result = await this.db
            .collection<Run>("workflow_runs")
            .updateOne(
                { _id: id, "lease.token": token, "lease.expiresAt": { $gt: now } },
                { $set: { "lease.expiresAt": expiresAt } },
            );
        return result.matchedCount === 1;
    }
    async checkpoint(record: WorkflowRun, revision: number, token: string | undefined, now: number) {
        if (record.revision !== revision + 1) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        const result = await this.db.collection<Run>("workflow_runs").replaceOne(
            {
                _id: record.id,
                revision,
                purging: { $ne: true },
                ...(token ? { "lease.token": token, "lease.expiresAt": { $gt: now } } : {}),
            },
            {
                ...record,
                ...(["succeeded", "failed", "cancelled"].includes(record.status)
                    ? { purgeAt: new Date(now + 604800000) }
                    : {}),
            },
        );
        return result.matchedCount === 1;
    }
}

function eventRunId(deliveryId: string) {
    return `event:${createHash("sha256").update(deliveryId).digest("hex")}`;
}
