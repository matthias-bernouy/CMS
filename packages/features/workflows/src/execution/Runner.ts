import { resolveWorkflowCall } from "workflows/definitions/health";
import { workflowLease, recoverStepFailure } from "./lease";
import { finishStep } from "./finish";
import { createHash } from "node:crypto";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { WorkflowServices } from "workflows/interfaces/services";
import { evaluateExpression } from "workflows/core/expressions/evaluate";
import { WorkflowError } from "workflows/core/errors";
import { executionScope } from "./scope";
import { checkpoint, stepPatch } from "./checkpoint";
export class WorkflowRunner {
    constructor(
        private readonly services: WorkflowServices,
        private readonly policy: { leaseMs: number; retryMs: number; maxAttempts: number },
    ) {}
    async runOne(): Promise<boolean> {
        const token = crypto.randomUUID();
        let run = await this.services.store.claim(
            this.services.now(),
            token,
            this.services.now() + this.policy.leaseMs,
        );
        if (!run) {
            return false;
        }
        const lease = workflowLease(this.services, run.id, token, this.policy.leaseMs);
        try {
            try {
                await this.services.authority.assertAdministrator(run.administratorId);
            } catch (error) {
                const revoked = error instanceof WorkflowError && error.code === "FORBIDDEN";
                await checkpoint(
                    this.services,
                    run,
                    {
                        status: "waiting",
                        failureCode: revoked ? "ADMIN_AUTHORITY_REQUIRED" : "AUTHORITY_UNAVAILABLE",
                        dueAt: revoked ? Number.MAX_SAFE_INTEGER : this.services.now() + this.policy.retryMs,
                        lease: undefined,
                    },
                    token,
                    this.policy.leaseMs,
                );
                return true;
            }
            const plan = await this.services.store.plan(run.workflowId, run.workflowRevision, true);
            if (!plan) {
                throw new WorkflowError("PLAN_UNAVAILABLE");
            }
            if (run.currentStep === null) {
                const output = evaluateExpression(
                    plan.definition.output,
                    await executionScope(plan.definition.output, run, this.services, plan.parameters),
                );
                validateSchemaValue(plan.definition.outputSchema, output);
                const resultRef = await this.services.values.put(run.id, `result:${run.revision}`, output);
                if (lease.held()) {
                    await checkpoint(
                        this.services,
                        run,
                        { status: "succeeded", resultRef, lease: undefined },
                        token,
                        this.policy.leaseMs,
                    );
                }
                return true;
            }
            const step = plan.definition.steps.find(({ id }) => id === run!.currentStep);
            if (!step) {
                throw new WorkflowError("INVALID_STATE");
            }
            if (step.kind === "condition") {
                const value = evaluateExpression(
                    step.test,
                    await executionScope(step.test, run, this.services, plan.parameters),
                );
                if (typeof value !== "boolean") {
                    throw new WorkflowError("INVALID_STATE");
                }
                if (lease.held()) {
                    await checkpoint(
                        this.services,
                        run,
                        {
                            status: "queued",
                            currentStep: value ? step.then : step.otherwise,
                            ...stepPatch(run, step.id, { state: "succeeded", attempts: 0 }),
                            lease: undefined,
                            dueAt: this.services.now(),
                        },
                        token,
                        this.policy.leaseMs,
                    );
                }
                return true;
            }
            const previous = run.steps[step.id];
            const capability = plan.capabilities[step.id]!.capability;
            if (previous?.state === "succeeded") {
                throw new WorkflowError("INVALID_STATE");
            }
            if (
                previous?.state === "running" &&
                capability.behavior.effect === "command" &&
                capability.behavior.idempotency === "none"
            ) {
                await checkpoint(
                    this.services,
                    run,
                    {
                        status: "outcomeUnknown",
                        ...stepPatch(run, step.id, { ...previous, state: "outcomeUnknown" }),
                        lease: undefined,
                    },
                    token,
                    this.policy.leaseMs,
                );
                return true;
            }
            if (previous?.state === "waiting" && previous.operationId) {
                const outcome = await this.services.execution.operation(
                    plan.capabilities[step.id]!,
                    previous.operationId,
                );
                if (outcome.state === "waiting") {
                    await checkpoint(
                        this.services,
                        run,
                        { status: "waiting", dueAt: this.services.now() + this.policy.retryMs, lease: undefined },
                        token,
                        this.policy.leaseMs,
                    );
                } else if (lease.held()) {
                    await finishStep(
                        this.services,
                        this.policy,
                        run,
                        plan,
                        step,
                        token,
                        outcome.state === "succeeded"
                            ? { kind: "success", requestId: run.id, output: outcome.output }
                            : {
                                  kind: "declared-error",
                                  requestId: run.id,
                                  errorCode: outcome.errorCode ?? "OPERATION_FAILED",
                                  retryable: false,
                                  output: outcome.errorOutput,
                              },
                    );
                }
                return true;
            }
            const attempts = previous?.attempts ?? 0;
            if (attempts >= this.policy.maxAttempts) {
                await checkpoint(
                    this.services,
                    run,
                    {
                        status: "waiting",
                        failureCode: "RETRY_EXHAUSTED",
                        dueAt: Number.MAX_SAFE_INTEGER,
                        lease: undefined,
                    },
                    token,
                    this.policy.leaseMs,
                );
                return true;
            }
            const input = previous?.inputRef
                ? await this.services.values.get(run.id, previous.inputRef)
                : evaluateExpression(step.input, await executionScope(step.input, run, this.services, plan.parameters));
            try {
                validateSchemaValue(capability.input, input);
            } catch {
                throw new WorkflowError("INVALID_DEFINITION", `steps.${step.id}.input`);
            }
            await resolveWorkflowCall(plan.capabilities[step.id]!, this.services.contracts, `steps.${step.id}`);
            const inputRef = previous?.inputRef ?? (await this.services.values.put(run.id, `${step.id}:input`, input));
            if (!lease.held()) {
                return true;
            }
            run = await checkpoint(
                this.services,
                run,
                { ...stepPatch(run, step.id, { state: "running", attempts: attempts + 1, inputRef }) },
                token,
                this.policy.leaseMs,
            );
            const key =
                capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed"
                    ? `workflow:${createHash("sha256").update(`${run.id}:${step.id}`).digest("hex")}`
                    : undefined;
            const result = await this.services.execution.invoke(
                plan.capabilities[step.id]!,
                input,
                run.administratorId,
                key,
                run.causation,
            );
            if (lease.held()) {
                await finishStep(this.services, this.policy, run, plan, step, token, result);
            }
        } catch (error) {
            if (lease.held() && !(error instanceof WorkflowError && error.code === "LEASE_LOST")) {
                await recoverStepFailure(this.services, this.policy, run, token, error);
            }
        } finally {
            await lease.stop();
        }
        return true;
    }
}
