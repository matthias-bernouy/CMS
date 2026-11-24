import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { GatewayResult } from "@bernouy/cms-gateway";
import type { WorkflowRun, WorkflowStepState } from "workflows/interfaces/store";
import type { WorkflowServices } from "workflows/interfaces/services";
import type { WorkflowPlan, WorkflowStep } from "workflows/interfaces/definition";
import { WorkflowError } from "workflows/core/errors";
import { checkpoint, stepPatch } from "./checkpoint";
export async function finishStep(
    services: WorkflowServices,
    policy: { leaseMs: number; retryMs: number },
    run: WorkflowRun,
    plan: WorkflowPlan,
    step: Extract<WorkflowStep, { kind: "call" }>,
    token: string,
    result: GatewayResult,
) {
    const capability = plan.capabilities[step.id]!.capability;
    const previous = run.steps[step.id]!;
    let state: WorkflowStepState;
    let next: string | null = step.next;
    if (result.kind === "success" && capability.behavior.execution === "operation" && previous.state !== "waiting") {
        if (
            !result.output ||
            typeof result.output !== "object" ||
            !("operationId" in result.output) ||
            typeof result.output.operationId !== "string"
        ) {
            throw new WorkflowError("INVALID_OPERATION");
        }
        await checkpoint(
            services,
            run,
            {
                status: "waiting",
                ...stepPatch(run, step.id, {
                    ...previous,
                    state: "waiting",
                    operationId: result.output.operationId,
                }),
                dueAt: services.now() + policy.retryMs,
                lease: undefined,
            },
            token,
            policy.leaseMs,
        );
        return;
    }
    if (result.kind === "success") {
        validateSchemaValue(capability.output, result.output);
        state = {
            ...previous,
            state: "succeeded",
            outputRef: await services.values.put(run.id, `${step.id}:output:${run.revision}`, result.output),
        };
    } else if (result.kind === "declared-error") {
        const error = capability.errors.find(({ code }) => code === result.errorCode);
        if (error?.output) {
            validateSchemaValue(error.output, result.output);
        }
        const detail = { code: result.errorCode, ...(error?.output ? { output: result.output } : {}) };
        state = {
            ...previous,
            state: "failed",
            errorCode: result.errorCode,
            errorRef: await services.values.put(run.id, `${step.id}:error:${run.revision}`, detail),
        };
        next = step.onError[result.errorCode] ?? null;
        if (!step.onError[result.errorCode]) {
            await checkpoint(
                services,
                run,
                {
                    status: "failed",
                    ...stepPatch(run, step.id, state),
                    failureCode: result.errorCode,
                    lease: undefined,
                },
                token,
                policy.leaseMs,
            );
            return;
        }
    } else {
        throw new WorkflowError("UNSUPPORTED_RESULT");
    }
    await checkpoint(
        services,
        run,
        {
            status: "queued",
            currentStep: next,
            ...stepPatch(run, step.id, state),
            dueAt: services.now(),
            lease: undefined,
        },
        token,
        policy.leaseMs,
    );
}
