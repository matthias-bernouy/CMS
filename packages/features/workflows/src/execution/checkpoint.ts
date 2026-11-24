import type { WorkflowRun, WorkflowStepState } from "workflows/interfaces/store";
import type { WorkflowServices } from "workflows/interfaces/services";
import { WorkflowError } from "workflows/core/errors";
export async function checkpoint(
    services: WorkflowServices,
    run: WorkflowRun,
    patch: Partial<WorkflowRun>,
    token: string | undefined,
    leaseMs: number,
) {
    const now = services.now();
    const next: WorkflowRun = {
        ...run,
        ...patch,
        revision: run.revision + 1,
        updatedAt: new Date(now).toISOString(),
        ...(token && !Object.hasOwn(patch, "lease") ? { lease: { token, expiresAt: now + leaseMs } } : {}),
    };
    const { lease, failureCode, ...metadata } = next;
    const progress = patch.status === "queued" || patch.status === "succeeded";
    const stored: WorkflowRun = {
        ...metadata,
        ...(lease ? { lease } : {}),
        ...(!progress && failureCode ? { failureCode } : {}),
    };
    if (!(await services.store.checkpoint(stored, run.revision, token, now))) {
        throw new WorkflowError("LEASE_LOST");
    }
    return stored;
}
export function stepPatch(run: WorkflowRun, id: string, step: WorkflowStepState) {
    return { steps: { ...run.steps, [id]: step } };
}
