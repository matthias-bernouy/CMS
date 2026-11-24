import type { WorkflowServices } from "workflows/interfaces/services";
import type { WorkflowTrigger } from "workflows/interfaces/store";
import { WorkflowError } from "workflows/core/errors";
export async function settleWorkflowTrigger(
    services: WorkflowServices,
    record: WorkflowTrigger,
): Promise<WorkflowTrigger> {
    if (["active", "suspended", "deleted"].includes(record.state)) {
        return record;
    }
    if (record.state === "suspending") {
        const subscription = await services.domainSubscriptions.disable(record.subscriptionId);
        const next: WorkflowTrigger = {
            ...record,
            state: "suspended",
            subscriptionRevision: subscription.revision,
            revision: record.revision + 1,
        };
        if (!(await services.store.updateTrigger(next, record.revision))) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        return next;
    }
    if (record.state === "deleting") {
        await services.domainSubscriptions.remove(record.subscriptionId);
        const next: WorkflowTrigger = { ...record, state: "deleted", revision: record.revision + 1 };
        if (!(await services.store.updateTrigger(next, record.revision))) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        return next;
    }
    await services.authority.assertAdministrator(record.administratorId);
    const plan = await services.store.plan(record.workflowId, record.workflowRevision);
    if (!plan?.eventTrigger) {
        throw new WorkflowError("INVALID_STATE");
    }
    const subscription = await services.domainSubscriptions.ensure(
        record.subscriptionId,
        {
            definitionId: plan.eventTrigger.id,
            definitionDigest: plan.eventTrigger.digest,
            enabled: true,
            ...(plan.eventFilterJson ? { filterJson: plan.eventFilterJson } : {}),
            delivery: { contractId: "ulvia/cms.workflows", capabilityId: "events.receive" },
        },
        record.subscriptionRevision,
    );
    const next: WorkflowTrigger = {
        ...record,
        revision: record.revision + 1,
        state: "active",
        subscriptionRevision: subscription.revision,
    };
    if (!(await services.store.updateTrigger(next, record.revision))) {
        throw new WorkflowError("REVISION_CONFLICT");
    }
    return next;
}
