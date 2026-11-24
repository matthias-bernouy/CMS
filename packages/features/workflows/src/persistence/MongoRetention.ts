import { WorkflowError } from "workflows/core/errors";
import { MongoWorkflowOrphans } from "./MongoOrphans";
import type { WorkflowRun } from "workflows/interfaces/store";
type StoredRun = WorkflowRun & { _id: string; purging?: boolean; purgeAt?: Date };
/** A permanent-for-the-receipt-window tombstone fences resumed runs and late value writers during bounded purges. */
export class MongoWorkflowRetention extends MongoWorkflowOrphans {
    async initRetention() {
        await this.initOrphans();
        await this.db.collection("workflow_runs").createIndex({ purgeAt: 1, _id: 1 });
        await this.db.collection("workflow_runs").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await this.db.collection("workflow_values").createIndex({ runId: 1, _id: 1 });
        await this.db.collection("workflow_value_chunks").createIndex({ runId: 1, _id: 1 });
    }
    async purgeRuns(now: number, limit: number) {
        const records = this.db.collection<StoredRun>("workflow_runs");
        const rows = await records
            .find(
                { purgeAt: { $lte: new Date(now) }, status: { $in: ["succeeded", "failed", "cancelled"] } },
                { maxTimeMS: 2000 },
            )
            .sort({ _id: 1 })
            .limit(limit)
            .toArray();
        for (const row of rows) {
            if (row.id !== row._id || row.id.startsWith("definition:") || row.id.startsWith("installation:")) {
                throw new WorkflowError("CORE_UNAVAILABLE");
            }
            const claimed = await records.updateOne(
                { _id: row._id, revision: row.revision, status: row.status, purgeAt: { $lte: new Date(now) } },
                { $set: { purging: true } },
            );
            if (claimed.matchedCount !== 1) {
                continue;
            }
            if (!(await this.values.purge(row.id, 64))) {
                continue;
            }
            await this.db
                .collection<{
                    _id: string;
                    purging: boolean;
                    discarded: boolean;
                    expiresAt: Date;
                    receipt?: WorkflowRun["receipt"];
                }>("workflow_runs")
                .replaceOne(
                    { _id: row._id, purging: true },
                    {
                        purging: true,
                        discarded: true,
                        ...(row.receipt ? { receipt: row.receipt } : {}),
                        expiresAt: new Date(Math.max(now, Date.parse(row.createdAt) + 2592000000)),
                    },
                );
        }
        return rows.length;
    }
}
