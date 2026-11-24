import { inspectWorkflowPlan } from "./health";
import type { WorkflowDiagnostic } from "workflows/interfaces/store";
import type { WorkflowServices } from "workflows/interfaces/services";
import type { WorkflowTrigger } from "workflows/interfaces/store";
import { WorkflowError } from "workflows/core/errors";
import { settleWorkflowTrigger } from "./triggerSubscriptions";
export class WorkflowTriggers {
    constructor(private readonly services: WorkflowServices) {}
    async create(id: string, workflowId: string, workflowRevision: number, administratorId: string) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id)) {
            throw new WorkflowError("INVALID_INPUT");
        }
        const plan = await this.services.store.plan(workflowId, workflowRevision);
        if (!plan?.definition.trigger) {
            throw new WorkflowError("INVALID_STATE");
        }
        const diagnostic = await inspectWorkflowPlan(plan, this.services.contracts);
        if (diagnostic) {
            throw new WorkflowError("INVALID_DEFINITION", diagnostic.path);
        }
        const record = await this.services.store.createTrigger({
            id,
            revision: 1,
            workflowId,
            workflowRevision,
            administratorId,
            subscriptionId: id,
            subscriptionRevision: 0,
            state: "preparing",
        });
        if (record.state === "deleted" || record.state === "deleting") {
            throw new WorkflowError("TRIGGER_CONFLICT");
        }
        return this.settle(record);
    }
    async update(id: string, revision: number, workflowId: string, workflowRevision: number, administratorId: string) {
        const current = await this.services.store.trigger(id);
        const plan = await this.services.store.plan(workflowId, workflowRevision);
        if (!current || current.revision !== revision) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        if (!plan?.definition.trigger || !["active", "suspended"].includes(current.state)) {
            throw new WorkflowError("INVALID_STATE");
        }
        const diagnostic = await inspectWorkflowPlan(plan, this.services.contracts);
        if (diagnostic) {
            throw new WorkflowError("INVALID_DEFINITION", diagnostic.path);
        }
        const { diagnostic: _diagnostic, ...rest } = current;
        const next: WorkflowTrigger = {
            ...rest,
            workflowId,
            workflowRevision,
            administratorId,
            revision: revision + 1,
            state: "preparing",
        };
        if (!(await this.services.store.updateTrigger(next, revision))) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        return this.settle(next);
    }
    async remove(id: string, revision: number) {
        const record = await this.services.store.trigger(id);
        if (!record) {
            throw new WorkflowError("NOT_FOUND");
        }
        if (record.revision !== revision || record.state === "deleted") {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        const next: WorkflowTrigger = { ...record, revision: revision + 1, state: "deleting" };
        if (!(await this.services.store.updateTrigger(next, revision))) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        await this.settle(next);
    }
    async suspend(record: WorkflowTrigger, diagnostic: WorkflowDiagnostic): Promise<WorkflowTrigger> {
        if (!["active", "preparing"].includes(record.state)) {
            return record;
        }
        const next: WorkflowTrigger = { ...record, state: "suspending", diagnostic, revision: record.revision + 1 };
        if (!(await this.services.store.updateTrigger(next, record.revision))) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        return this.settle(next);
    }
    async revalidate(id: string, revision: number) {
        const record = await this.services.store.trigger(id);
        if (!record || record.revision !== revision) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        const plan = await this.services.store.plan(record.workflowId, record.workflowRevision);
        const diagnostic = plan
            ? await inspectWorkflowPlan(plan, this.services.contracts)
            : { code: "PLAN_UNAVAILABLE", path: "$" };
        if (diagnostic && ["active", "preparing"].includes(record.state)) {
            return this.suspend(record, diagnostic);
        }
        return record;
    }
    async settle(record: WorkflowTrigger): Promise<WorkflowTrigger> {
        return settleWorkflowTrigger(this.services, record);
    }
}
