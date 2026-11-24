import type { WorkflowTrigger } from "workflows/interfaces/store";
import { MongoInstalledWorkflowPlans } from "./installations/Plans";
import { WorkflowError } from "workflows/core/errors";
export class MongoWorkflowTriggers extends MongoInstalledWorkflowPlans {
    async triggersForWorkflow(workflowId: string, limit: number) {
        return this.db
            .collection<WorkflowTrigger & { _id: string }>("workflow_triggers")
            .find({ workflowId, state: { $ne: "deleted" } }, { maxTimeMS: 2000 })
            .sort({ _id: 1 })
            .limit(limit)
            .toArray()
            .then((rows) => rows.map(({ _id: _id, ...record }) => record));
    }
    async createTrigger(record: WorkflowTrigger) {
        try {
            await this.db
                .collection<WorkflowTrigger & { _id: string }>("workflow_triggers")
                .insertOne({ _id: record.id, ...record });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const existing = await this.trigger(record.id);
            if (
                !existing ||
                existing.workflowId !== record.workflowId ||
                existing.workflowRevision !== record.workflowRevision ||
                existing.administratorId !== record.administratorId
            ) {
                throw new WorkflowError("TRIGGER_CONFLICT");
            }
            return existing;
        }
        return record;
    }
    async trigger(id: string, subscriptionRevision?: number): Promise<WorkflowTrigger | null> {
        const row = await this.db
            .collection<WorkflowTrigger & { _id: string }>(
                subscriptionRevision === undefined ? "workflow_triggers" : "workflow_trigger_versions",
            )
            .findOne(
                { _id: subscriptionRevision === undefined ? id : `${id}:${subscriptionRevision}` },
                { maxTimeMS: 2000 },
            );
        if (!row) {
            return null;
        }
        const { _id: _id, ...record } = row;
        return record;
    }
    async triggerBySubscription(id: string): Promise<WorkflowTrigger | null> {
        const row = await this.db
            .collection<WorkflowTrigger & { _id: string }>("workflow_triggers")
            .findOne({ subscriptionId: id }, { maxTimeMS: 2000 });
        if (!row) {
            return null;
        }
        const { _id: _id, ...record } = row;
        return record;
    }
    async triggers(cursor: string | undefined, limit: number) {
        const rows = await this.db
            .collection<WorkflowTrigger & { _id: string }>("workflow_triggers")
            .find(cursor ? { _id: { $gt: cursor } } : {}, { maxTimeMS: 2000 })
            .sort({ _id: 1 })
            .limit(limit + 1)
            .toArray();
        return {
            items: rows.slice(0, limit).map(({ _id: _id, ...record }) => record),
            ...(rows.length > limit ? { nextCursor: rows[limit - 1]!._id } : {}),
        };
    }
    async pendingTriggers(limit: number, after?: string) {
        const rows = await this.db
            .collection<WorkflowTrigger & { _id: string }>("workflow_triggers")
            .find(
                { state: { $in: ["preparing", "suspending", "deleting"] }, ...(after ? { _id: { $gt: after } } : {}) },
                { maxTimeMS: 2000 },
            )
            .sort({ _id: 1 })
            .limit(limit)
            .toArray();
        return rows.map(({ _id: _id, ...record }) => record);
    }
    async updateTrigger(record: WorkflowTrigger, expectedRevision: number) {
        if (record.state === "active") {
            const versions = this.db.collection<WorkflowTrigger & { _id: string }>("workflow_trigger_versions");
            const _id = `${record.subscriptionId}:${record.subscriptionRevision}`;
            try {
                await versions.insertOne({ _id, ...record });
            } catch (error) {
                if ((error as { code?: number }).code !== 11000) {
                    throw error;
                }
                const existing = await versions.findOne({ _id });
                if (
                    !existing ||
                    existing.workflowId !== record.workflowId ||
                    existing.workflowRevision !== record.workflowRevision ||
                    existing.administratorId !== record.administratorId
                ) {
                    throw new WorkflowError("TRIGGER_CONFLICT");
                }
            }
        }
        const result = await this.db
            .collection<WorkflowTrigger & { _id: string }>("workflow_triggers")
            .replaceOne({ _id: record.id, revision: expectedRevision }, record);
        return result.matchedCount === 1;
    }
}
