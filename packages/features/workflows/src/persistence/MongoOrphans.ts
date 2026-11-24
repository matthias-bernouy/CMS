import { WorkflowError } from "workflows/core/errors";
import { MongoWorkflowTriggers } from "./MongoTriggers";
type Scope = { _id: string; createdAt: Date; accepted: boolean };
type Marker = {
    _id: string;
    purging?: boolean;
    discarded?: boolean;
    orphanPurgePending?: boolean;
    orphanReceiptExpiresAt?: Date;
};
/** Reserve the actual run identity before deleting unaccepted preparations, so a concurrent run insert wins or refuses atomically. */
export class MongoWorkflowOrphans extends MongoWorkflowTriggers {
    async initOrphans() {
        await this.db.collection("workflow_value_scopes").createIndex({ accepted: 1, createdAt: 1, _id: 1 });
        await this.db.collection("workflow_runs").createIndex({ orphanPurgePending: 1, _id: 1 });
    }
    async purgeOrphans(now: number, limit: number) {
        const runs = this.db.collection<Marker>("workflow_runs");
        const pending = await runs
            .find({ orphanPurgePending: true }, { maxTimeMS: 2000 })
            .sort({ _id: 1 })
            .limit(limit)
            .toArray();
        for (const marker of pending) {
            await this.finishOrphan(marker, now);
        }
        const scopes = this.db.collection<Scope>("workflow_value_scopes");
        const rows = await scopes
            .find({ accepted: false, createdAt: { $lte: new Date(now - 604800000) } }, { maxTimeMS: 2000 })
            .sort({ createdAt: 1, _id: 1 })
            .limit(limit)
            .toArray();
        for (const scope of rows) {
            if (scope._id.startsWith("definition:") || scope._id.startsWith("installation:")) {
                continue;
            }
            const marker: Marker = {
                _id: scope._id,
                purging: true,
                discarded: true,
                orphanPurgePending: true,
                orphanReceiptExpiresAt: new Date(Math.max(now, scope.createdAt.getTime() + 2592000000)),
            };
            try {
                await runs.insertOne(marker);
            } catch (error) {
                if ((error as { code?: number }).code !== 11000) {
                    throw error;
                }
                const existing = await runs.findOne({ _id: scope._id }, { maxTimeMS: 2000 });
                if (!existing || existing.orphanPurgePending) {
                    continue;
                }
                if (existing.discarded) {
                    await this.values.purge(scope._id, 64);
                } else {
                    await this.values.accept(scope._id);
                }
                continue;
            }
            await this.finishOrphan(marker, now);
        }
        return pending.length + rows.length;
    }
    private async finishOrphan(marker: Marker, _now: number) {
        if (
            !(marker.orphanReceiptExpiresAt instanceof Date) ||
            !Number.isFinite(marker.orphanReceiptExpiresAt.getTime())
        ) {
            throw new WorkflowError("CORE_UNAVAILABLE");
        }
        if (!(await this.values.purge(marker._id, 64))) {
            return;
        }
        await this.db.collection<Marker & { expiresAt: Date }>("workflow_runs").updateOne(
            { _id: marker._id, orphanPurgePending: true },
            {
                $set: { expiresAt: marker.orphanReceiptExpiresAt },
                $unset: { orphanPurgePending: "", orphanReceiptExpiresAt: "" },
            },
        );
    }
}
