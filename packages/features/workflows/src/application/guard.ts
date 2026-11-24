import { canonicalizeIJson, parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import type { WorkflowRunSummary, WorkflowTrigger } from "workflows/interfaces/store";
import { WorkflowError } from "workflows/core/errors";
export function inputJson(json: string): unknown {
    try {
        return parseStrictJson(new TextEncoder().encode(json), 1048576, 64);
    } catch {
        throw new WorkflowError("INVALID_INPUT");
    }
}
export function outputJson(value: unknown): string {
    const json = canonicalizeIJson(value);
    if (new TextEncoder().encode(json).byteLength > 1048576) {
        throw new WorkflowError("VALUE_TOO_LARGE");
    }
    return json;
}
export function triggerDto(record: WorkflowTrigger) {
    return {
        id: record.id,
        revision: record.revision,
        workflowId: record.workflowId,
        workflowRevision: record.workflowRevision,
        subscriptionId: record.subscriptionId,
        subscriptionRevision: record.subscriptionRevision,
        state: record.state,
        ...(record.diagnostic ? { diagnostic: record.diagnostic } : {}),
    };
}
export function runDto(record: WorkflowRunSummary) {
    return {
        id: record.id,
        workflowId: record.workflowId,
        workflowRevision: record.workflowRevision,
        revision: record.revision,
        status: record.status,
        currentStep: record.currentStep,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ...(record.failurePath ? { failurePath: record.failurePath } : {}),
        ...(record.failureCode ? { failureCode: record.failureCode } : {}),
    };
}
