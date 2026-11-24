import { resolveWorkflowCall } from "workflows/definitions/health";
import { workflowResourceUse } from "workflows/core/events/usage";
import { workflowAncestry } from "./ancestry";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { WorkflowServices } from "workflows/interfaces/services";
import type { WorkflowRun } from "workflows/interfaces/store";
import { WorkflowError } from "workflows/core/errors";
export class WorkflowRuns {
    constructor(readonly services: WorkflowServices) {}
    async start(
        id: string,
        workflowId: string,
        workflowRevision: number,
        administratorId: string,
        input: unknown,
        parent?: readonly string[],
    ) {
        const plan = await this.services.store.plan(workflowId, workflowRevision);
        if (!plan || plan.definition.trigger) {
            throw new WorkflowError("INVALID_STATE");
        }
        validateSchemaValue(plan.definition.inputSchema, input);
        const record = await this.prepare(
            id,
            workflowId,
            workflowRevision,
            administratorId,
            input,
            undefined,
            parent,
        ).catch((error: unknown) => {
            if (error instanceof WorkflowError && error.code === "VALUE_CONFLICT") {
                throw new WorkflowError("RUN_CONFLICT");
            }
            throw error;
        });
        return this.services.store.createRun(record);
    }
    async prepare(
        id: string,
        workflowId: string,
        workflowRevision: number,
        administratorId: string,
        input: unknown,
        trigger?: unknown,
        parent?: readonly string[],
    ): Promise<WorkflowRun> {
        if (
            !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id) ||
            id.startsWith("definition:") ||
            id.startsWith("installation:")
        ) {
            throw new WorkflowError("INVALID_INPUT");
        }
        const plan = await this.services.store.plan(workflowId, workflowRevision);
        if (!plan) {
            throw new WorkflowError("INVALID_STATE");
        }
        validateSchemaValue(plan.definition.inputSchema, input);
        const causation = workflowAncestry(workflowId, workflowRevision, parent);
        if (!causation) {
            throw new WorkflowError("INVALID_STATE");
        }
        const resourceUse = workflowResourceUse(plan);
        const inputRef = await this.services.values.put(id, "input", input);
        const triggerRef = trigger === undefined ? undefined : await this.services.values.put(id, "trigger", trigger);
        const now = this.services.now();
        return {
            id,
            ...(resourceUse ? { resourceUse } : {}),
            workflowId,
            workflowRevision,
            causation,
            targets: [...Object.values(plan.capabilities).map(({ target }) => target)],
            administratorId,
            ...(plan.eventTrigger
                ? { eventDefinitions: [{ id: plan.eventTrigger.id, digest: plan.eventTrigger.digest }] }
                : {}),
            status: "queued",
            revision: 1,
            currentStep: plan.definition.entry,
            steps: {},
            inputRef,
            ...(triggerRef ? { triggerRef } : {}),
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
            dueAt: now,
        };
    }
    async get(id: string) {
        const record = await this.services.store.run(id);
        if (!record) {
            throw new WorkflowError("NOT_FOUND");
        }
        return record;
    }
    async cancel(id: string, revision: number) {
        const record = await this.get(id);
        if (record.revision !== revision || ["succeeded", "cancelled"].includes(record.status)) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        const { lease: _lease, ...rest } = record;
        const next: WorkflowRun = {
            ...rest,
            status: "cancelled",
            revision: revision + 1,
            dueAt: Number.MAX_SAFE_INTEGER,
            updatedAt: new Date(this.services.now()).toISOString(),
        };
        if (!(await this.services.store.checkpoint(next, revision, undefined, this.services.now()))) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        return next;
    }
    async resume(
        id: string,
        revision: number,
        administratorId: string,
        mode: "retry" | "resolve",
        resolution?: unknown,
    ) {
        const record = await this.get(id);
        if (
            record.revision !== revision ||
            !["waiting", "failed", "outcomeUnknown", "suspended"].includes(record.status)
        ) {
            throw new WorkflowError("INVALID_STATE");
        }
        const plan = await this.services.store.plan(record.workflowId, record.workflowRevision, true);
        const step = plan?.definition.steps.find((step) => step.id === record.currentStep);
        if (!plan || (!step && record.currentStep !== null) || (!step && mode !== "retry")) {
            throw new WorkflowError("INVALID_STATE");
        }
        if (mode === "retry") {
            for (const [id, capability] of Object.entries(plan.capabilities)) {
                if (!["succeeded", "waiting"].includes(record.steps[id]?.state ?? "")) {
                    await resolveWorkflowCall(capability, this.services.contracts, `steps.${id}`);
                }
            }
        }
        const previous = step ? record.steps[step.id] : undefined;
        if (previous?.state === "succeeded") {
            throw new WorkflowError("INVALID_STATE");
        }
        let currentStep = record.currentStep;
        let state = previous;
        if (mode === "resolve") {
            if (
                !step ||
                step.kind !== "call" ||
                !resolution ||
                typeof resolution !== "object" ||
                !("kind" in resolution) ||
                resolution.kind !== "success" ||
                !("output" in resolution)
            ) {
                throw new WorkflowError("INVALID_INPUT");
            }
            validateSchemaValue(plan.capabilities[step.id]!.capability.output, resolution.output);
            const outputRef = await this.services.values.put(
                record.id,
                `resolved:${step.id}:${revision}`,
                resolution.output,
            );
            state = { ...previous, state: "succeeded", attempts: previous?.attempts ?? 0, outputRef };
            currentStep = step.next;
        } else if (state) {
            state = { ...state, state: state.operationId ? "waiting" : "pending", attempts: 0 };
        }
        const { lease: _lease, failureCode: _failure, failurePath: _path, ...rest } = record;
        const next: WorkflowRun = {
            ...rest,
            administratorId,
            ...(plan.eventTrigger
                ? { eventDefinitions: [{ id: plan.eventTrigger.id, digest: plan.eventTrigger.digest }] }
                : {}),
            status: "queued",
            revision: revision + 1,
            currentStep,
            steps: state && step ? { ...record.steps, [step.id]: state } : record.steps,
            dueAt: this.services.now(),
            updatedAt: new Date(this.services.now()).toISOString(),
        };
        if (!(await this.services.store.checkpoint(next, revision, undefined, this.services.now()))) {
            throw new WorkflowError("REVISION_CONFLICT");
        }
        return next;
    }
}
