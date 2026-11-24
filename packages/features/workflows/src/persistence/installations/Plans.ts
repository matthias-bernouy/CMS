import { MongoWorkflowDefinitions } from "../MongoDefinitions";
import type { StoredWorkflowPlan } from "../MongoDefinitions";
import type { WorkflowPlan } from "workflows/interfaces/definition";
import { workflowResourceUse } from "workflows/core/events/usage";
import { WorkflowError } from "workflows/core/errors";
export class MongoInstalledWorkflowPlans extends MongoWorkflowDefinitions {
    async publishInstalledPlan(installationId: string, workflowId: string, revision: number, plan: WorkflowPlan) {
        const current = await this.db
            .collection<{ _id: string; workflowId: string; revision: number; state: string }>("workflow_installations")
            .findOne(
                { _id: installationId, workflowId, revision, state: "installed" },
                { projection: { _id: 1 }, maxTimeMS: 2000 },
            );
        if (!current) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        const reference = await this.values.put(`definition:${workflowId}`, `plan:${revision}:${plan.digest}`, plan);
        const resourceUse = workflowResourceUse(plan);
        const record: StoredWorkflowPlan = {
            _id: `${workflowId}:${revision}`,
            installationId,
            workflowId,
            revision,
            reference,
            retired: false,
            confirmed: false,
            targets: Object.values(plan.capabilities).map(({ target }) => target),
            ...(plan.eventTrigger
                ? { eventDefinitions: [{ id: plan.eventTrigger.id, digest: plan.eventTrigger.digest }] }
                : {}),
            ...(resourceUse ? { resourceUse } : {}),
        };
        const plans = this.db.collection<StoredWorkflowPlan>("workflow_plans");
        try {
            await plans.insertOne(record);
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const previous = await plans.findOne({ _id: record._id }, { maxTimeMS: 2000 });
            if (
                !previous ||
                previous.reference !== reference ||
                previous.installationId !== installationId ||
                previous.retired
            ) {
                throw new WorkflowError("DEFINITION_CONFLICT");
            }
        }
    }
    async confirmInstalledPlan(installationId: string, workflowId: string, revision: number) {
        const installation = await this.db
            .collection<{
                _id: string;
                workflowId: string;
                state: string;
                publishedRevision: number | null;
                pendingPublication: number | null;
            }>("workflow_installations")
            .findOne(
                {
                    _id: installationId,
                    workflowId,
                    state: "installed",
                    publishedRevision: revision,
                    pendingPublication: revision,
                },
                { projection: { _id: 1 }, maxTimeMS: 2000 },
            );
        const plans = this.db.collection<StoredWorkflowPlan>("workflow_plans");
        const filter = { _id: `${workflowId}:${revision}`, installationId, workflowId, revision };
        if (!installation) {
            const confirmed = await plans.findOne({ ...filter, confirmed: true }, { maxTimeMS: 2000 });
            if (!confirmed) {
                throw new WorkflowError("REVISION_CONFLICT");
            }
            return;
        }
        if ((await plans.updateOne(filter, { $set: { confirmed: true } })).matchedCount !== 1) {
            throw new WorkflowError("CORE_UNAVAILABLE");
        }
    }
    async retireInstalledPlans(workflowId: string) {
        await this.db
            .collection<StoredWorkflowPlan>("workflow_plans")
            .updateMany(
                { workflowId, installationId: { $exists: true } },
                { $set: { retired: true } },
                { maxTimeMS: 2000 },
            );
    }
}
