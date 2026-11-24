import type { InstalledWorkflowPlanStore } from "./installations";
import type { WorkflowResourceUse } from "./resource";
import type { EventDefinitionReference } from "@bernouy/cms-events";
import type { WorkflowPlan } from "./definition";
import type { EventMessage } from "@bernouy/cms-gateway/events";
export interface WorkflowDraft {
    readonly id: string;
    readonly revision: number;
    readonly definitionJson: string;
    readonly parametersJson: string;
    readonly publishedRevision: number | null;
    readonly updatedAt: string;
}
export interface WorkflowDiagnostic {
    readonly code: string;
    readonly path: string;
}
export interface WorkflowTrigger {
    readonly diagnostic?: WorkflowDiagnostic;
    readonly id: string;
    readonly revision: number;
    readonly workflowId: string;
    readonly workflowRevision: number;
    readonly administratorId: string;
    readonly subscriptionId: string;
    readonly subscriptionRevision: number;
    readonly state: "preparing" | "active" | "suspending" | "suspended" | "deleting" | "deleted";
}
export interface WorkflowStepState {
    readonly attempts: number;
    readonly state: "pending" | "running" | "succeeded" | "failed" | "waiting" | "outcomeUnknown";
    readonly inputRef?: string;
    readonly outputRef?: string;
    readonly errorRef?: string;
    readonly errorCode?: string;
    readonly operationId?: string;
}
export interface WorkflowRun {
    readonly failurePath?: string;
    readonly resourceUse?: WorkflowResourceUse;
    readonly eventDefinitions?: readonly EventDefinitionReference[];
    readonly causation?: readonly string[];
    readonly receipt?: { readonly deliveryId: string; readonly fingerprint: string };
    readonly targets: readonly WorkflowPlan["capabilities"][string]["target"][];
    readonly id: string;
    readonly workflowId: string;
    readonly workflowRevision: number;
    readonly administratorId: string;
    readonly status:
        | "queued"
        | "running"
        | "waiting"
        | "succeeded"
        | "failed"
        | "outcomeUnknown"
        | "suspended"
        | "cancelled";
    readonly revision: number;
    readonly currentStep: string | null;
    readonly steps: Readonly<Record<string, WorkflowStepState>>;
    readonly inputRef: string;
    readonly triggerRef?: string;
    readonly resultRef?: string;
    readonly failureCode?: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly dueAt: number;
    readonly lease?: { readonly token: string; readonly expiresAt: number };
}
export type WorkflowRunSummary = Pick<
    WorkflowRun,
    | "id"
    | "workflowId"
    | "workflowRevision"
    | "revision"
    | "status"
    | "failureCode"
    | "failurePath"
    | "currentStep"
    | "createdAt"
    | "updatedAt"
    | "failureCode"
>;
export interface WorkflowStore extends InstalledWorkflowPlanStore {
    triggersForWorkflow(workflowId: string, limit: number): Promise<readonly WorkflowTrigger[]>;
    createDraft(record: WorkflowDraft): Promise<WorkflowDraft>;
    draft(id: string): Promise<WorkflowDraft | null>;
    updateDraft(record: WorkflowDraft, expectedRevision: number): Promise<boolean>;
    publish(id: string, revision: number, plan: WorkflowPlan): Promise<boolean>;
    plan(id: string, revision: number, existingRun?: boolean): Promise<WorkflowPlan | null>;
    retire(id: string, revision: number): Promise<boolean>;
    pendingTriggers(limit: number, after?: string): Promise<readonly WorkflowTrigger[]>;
    createTrigger(record: WorkflowTrigger): Promise<WorkflowTrigger>;
    trigger(id: string, subscriptionRevision?: number): Promise<WorkflowTrigger | null>;
    triggerBySubscription(id: string): Promise<WorkflowTrigger | null>;
    triggers(
        cursor: string | undefined,
        limit: number,
    ): Promise<{ items: readonly WorkflowTrigger[]; nextCursor?: string }>;
    updateTrigger(record: WorkflowTrigger, expectedRevision: number): Promise<boolean>;
    createRun(record: WorkflowRun): Promise<WorkflowRun>;
    eventReceipt(deliveryId: string): Promise<string | null>;
    acceptEvent(
        event: Pick<EventMessage, "deliveryId">,
        fingerprint: string,
        record: WorkflowRun | null,
    ): Promise<void>;
    run(id: string): Promise<WorkflowRun | null>;
    runs(
        cursor: string | undefined,
        limit: number,
    ): Promise<{ items: readonly WorkflowRunSummary[]; nextCursor?: string }>;
    claim(now: number, token: string, expiresAt: number): Promise<WorkflowRun | null>;
    renew(id: string, token: string, now: number, expiresAt: number): Promise<boolean>;
    checkpoint(record: WorkflowRun, expectedRevision: number, token: string | undefined, now: number): Promise<boolean>;
}
export interface WorkflowValues {
    accept(runId: string): Promise<void>;
    purge(runId: string, limit: number): Promise<boolean>;
    put(runId: string, slot: string, value: unknown): Promise<string>;
    get(runId: string, reference: string): Promise<unknown>;
}
