import { workflowResourceUse } from "workflows/core/events/usage";
import type { WorkflowResourceUse } from "workflows/interfaces/resource";
import type { EventDefinitionReference } from "@bernouy/cms-events";
import { ReadConcern } from "mongodb";
import type { Db } from "mongodb";
import type { WorkflowDraft, WorkflowValues } from "workflows/interfaces/store";
import type { WorkflowPlan } from "workflows/interfaces/definition";
import { WorkflowError } from "workflows/core/errors";
import { createHash } from "node:crypto";
type Publication = {
    eventDefinitions?: readonly EventDefinitionReference[];
    resourceUse?: WorkflowResourceUse;
    revision: number;
    reference: string;
    targets: readonly WorkflowPlan["capabilities"][string]["target"][];
};
type Draft = Omit<WorkflowDraft, "definitionJson" | "parametersJson"> & {
    _id: string;
    definitionRef: string;
    publication?: Publication;
};
export type StoredWorkflowPlan = {
    installationId?: string;
    confirmed?: boolean;
    eventDefinitions?: readonly EventDefinitionReference[];
    resourceUse?: WorkflowResourceUse;
    _id: string;
    workflowId: string;
    revision: number;
    reference: string;
    retired: boolean;
    targets: readonly WorkflowPlan["capabilities"][string]["target"][];
};
export class MongoWorkflowDefinitions {
    constructor(
        protected readonly db: Db,
        protected readonly values: WorkflowValues,
    ) {
        this.db = db.client.db(db.databaseName, {
            writeConcern: { w: "majority", j: true },
            readConcern: new ReadConcern("majority"),
        });
    }
    async createDraft(record: WorkflowDraft) {
        const definitionRef = await this.values.put(
            `definition:${record.id}`,
            `draft:${record.revision}:${hash(JSON.stringify([record.definitionJson, record.parametersJson]))}`,
            { definitionJson: record.definitionJson, parametersJson: record.parametersJson },
        );
        const { definitionJson: _json, parametersJson: _parameters, ...metadata } = record;
        try {
            await this.db
                .collection<Draft>("workflow_definitions")
                .insertOne({ _id: record.id, ...metadata, definitionRef });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const existing = await this.draft(record.id);
            if (
                !existing ||
                existing.definitionJson !== record.definitionJson ||
                existing.parametersJson !== record.parametersJson
            ) {
                throw new WorkflowError("DEFINITION_CONFLICT");
            }
            return existing;
        }
        return record;
    }
    async draft(id: string): Promise<WorkflowDraft | null> {
        const row = await this.db.collection<Draft>("workflow_definitions").findOne({ _id: id }, { maxTimeMS: 2000 });
        if (!row) {
            return null;
        }
        await this.finishPublication(row);
        const { _id, definitionRef, publication: _pending, ...metadata } = row;
        const definition = await this.values.get(`definition:${id}`, definitionRef);
        if (
            !definition ||
            typeof definition !== "object" ||
            !("definitionJson" in definition) ||
            typeof definition.definitionJson !== "string" ||
            !("parametersJson" in definition) ||
            typeof definition.parametersJson !== "string"
        ) {
            throw new WorkflowError("CORE_UNAVAILABLE");
        }
        return {
            ...metadata,
            id: _id,
            definitionJson: definition.definitionJson,
            parametersJson: definition.parametersJson,
        };
    }
    async updateDraft(record: WorkflowDraft, expectedRevision: number) {
        const current = await this.db
            .collection<Draft>("workflow_definitions")
            .findOne({ _id: record.id, revision: expectedRevision }, { projection: { _id: 1 }, maxTimeMS: 2000 });
        if (!current) {
            return false;
        }
        const definitionRef = await this.values.put(
            `definition:${record.id}`,
            `draft:${record.revision}:${hash(JSON.stringify([record.definitionJson, record.parametersJson]))}`,
            { definitionJson: record.definitionJson, parametersJson: record.parametersJson },
        );
        const { definitionJson: _json, parametersJson: _parameters, ...metadata } = record;
        const result = await this.db
            .collection<Draft>("workflow_definitions")
            .replaceOne(
                { _id: record.id, revision: expectedRevision, publication: { $exists: false } },
                { ...metadata, definitionRef },
            );
        return result.matchedCount === 1;
    }
    async recoverPublications(limit: number): Promise<number> {
        const rows = await this.db
            .collection<Draft>("workflow_definitions")
            .find({ "publication.revision": { $exists: true } }, { projection: { publication: 1 }, maxTimeMS: 2000 })
            .sort({ _id: 1 })
            .limit(limit)
            .toArray();
        for (const row of rows) {
            await this.finishPublication(row);
        }
        return rows.length;
    }
    async publish(id: string, revision: number, plan: WorkflowPlan) {
        const reference = await this.values.put(`definition:${id}`, `plan:${revision}:${plan.digest}`, plan);
        const plans = this.db.collection<StoredWorkflowPlan>("workflow_plans");
        const existing = await plans.findOne({ _id: `${id}:${revision}` }, { maxTimeMS: 2000 });
        if (existing?.retired) {
            throw new WorkflowError("INVALID_STATE");
        }
        if (existing && existing.reference !== reference) {
            throw new WorkflowError("DEFINITION_CONFLICT");
        }
        const resourceUse = workflowResourceUse(plan);
        const publication = {
            ...(resourceUse ? { resourceUse } : {}),
            ...(plan.eventTrigger
                ? { eventDefinitions: [{ id: plan.eventTrigger.id, digest: plan.eventTrigger.digest }] }
                : {}),
            revision,
            reference,
            targets: [...Object.values(plan.capabilities).map(({ target }) => target)],
        };
        const row = await this.db
            .collection<Draft>("workflow_definitions")
            .findOneAndUpdate(
                { _id: id, revision, publishedRevision: { $ne: revision }, publication: { $exists: false } },
                { $set: { publishedRevision: revision, publication } },
                { returnDocument: "after", maxTimeMS: 2000 },
            );
        if (!row) {
            return false;
        }
        await this.finishPublication(row);
        return true;
    }
    private async finishPublication(row: Pick<Draft, "_id" | "publication">) {
        const pending = row.publication;
        if (!pending) {
            return;
        }
        const record: StoredWorkflowPlan = {
            _id: `${row._id}:${pending.revision}`,
            workflowId: row._id,
            ...pending,
            retired: false,
        };
        try {
            await this.db.collection<StoredWorkflowPlan>("workflow_plans").insertOne(record);
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const existing = await this.db
                .collection<StoredWorkflowPlan>("workflow_plans")
                .findOne({ _id: record._id });
            if (!existing || existing.reference !== record.reference) {
                throw new WorkflowError("DEFINITION_CONFLICT");
            }
        }
        await this.db
            .collection<Draft>("workflow_definitions")
            .updateOne({ _id: row._id, "publication.reference": pending.reference }, { $unset: { publication: "" } });
    }
    async plan(id: string, revision: number, existingRun = false): Promise<WorkflowPlan | null> {
        const pending = await this.db
            .collection<Draft>("workflow_definitions")
            .findOne({ _id: id, "publication.revision": revision }, { maxTimeMS: 2000 });
        if (pending) {
            await this.finishPublication(pending);
        }
        const row = await this.db
            .collection<StoredWorkflowPlan>("workflow_plans")
            .findOne({ _id: `${id}:${revision}`, workflowId: id, revision }, { maxTimeMS: 2000 });
        if (!row || (row.installationId && row.confirmed !== true) || (!existingRun && row.retired)) {
            return null;
        }
        if (row.installationId && !existingRun) {
            const installation = await this.db
                .collection<{ _id: string; workflowId: string; revision: number; state: string }>(
                    "workflow_installations",
                )
                .findOne({ _id: row.installationId, state: "installed" }, { projection: { _id: 1 }, maxTimeMS: 2000 });
            if (!installation) {
                return null;
            }
        }
        if (typeof row.retired !== "boolean") {
            throw new WorkflowError("CORE_UNAVAILABLE");
        }
        const plan = await this.values.get(`definition:${id}`, row.reference);
        if (!plan || typeof plan !== "object" || !("format" in plan) || plan.format !== "ulvia-workflow-plan/v1") {
            throw new WorkflowError("CORE_UNAVAILABLE");
        }
        return plan as WorkflowPlan;
    }
    async retire(id: string, revision: number): Promise<boolean> {
        await this.plan(id, revision, true);
        const result = await this.db
            .collection<StoredWorkflowPlan>("workflow_plans")
            .updateOne({ _id: `${id}:${revision}`, workflowId: id, revision }, { $set: { retired: true } });
        return result.matchedCount === 1;
    }
}
function hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
}
