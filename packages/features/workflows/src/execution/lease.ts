import { workflowDiagnostic } from "workflows/definitions/health";
import type { WorkflowServices } from "workflows/interfaces/services";
import type { WorkflowRun } from "workflows/interfaces/store";
import { WorkflowError } from "workflows/core/errors";
import { checkpoint, stepPatch } from "./checkpoint";
export function workflowLease(services: WorkflowServices, id: string, token: string, leaseMs: number) {
    let held = true;
    let pending: Promise<void> | undefined;
    const timer = setInterval(
        () => {
            if (pending) {
                return;
            }
            pending = services.store
                .renew(id, token, services.now(), services.now() + leaseMs)
                .then((current) => {
                    if (!current) {
                        held = false;
                    }
                })
                .catch(() => {
                    held = false;
                })
                .finally(() => {
                    pending = undefined;
                });
        },
        Math.max(1, Math.floor(leaseMs / 3)),
    );
    return {
        held: () => held,
        async stop() {
            clearInterval(timer);
            await pending;
        },
    };
}
export async function recoverStepFailure(
    services: WorkflowServices,
    policy: { leaseMs: number; retryMs: number },
    run: WorkflowRun,
    token: string,
    error: unknown,
) {
    const current = run.currentStep ? run.steps[run.currentStep] : undefined;
    const capability = run.currentStep
        ? (await services.store.plan(run.workflowId, run.workflowRevision, true))?.capabilities[run.currentStep]
              ?.capability
        : undefined;
    const safe =
        capability?.behavior.effect === "query" ||
        (capability?.behavior.effect === "command" && capability.behavior.idempotency !== "none");
    const diagnostic = workflowDiagnostic(error, run.currentStep ? `steps.${run.currentStep}` : "$");
    const transient =
        !diagnostic &&
        (!current || current.state !== "running") &&
        (!(error instanceof WorkflowError) || error.code === "CORE_UNAVAILABLE");
    const retry = (current?.state === "running" && safe) || transient;
    const unknown = current?.state === "running" && !safe;
    await checkpoint(
        services,
        run,
        {
            status: unknown ? "outcomeUnknown" : diagnostic ? "suspended" : retry ? "waiting" : "failed",
            ...(diagnostic ? { failurePath: diagnostic.path, dueAt: Number.MAX_SAFE_INTEGER } : {}),
            ...(retry ? { dueAt: services.now() + policy.retryMs } : {}),
            ...(run.currentStep && current
                ? stepPatch(run, run.currentStep, {
                      ...current,
                      state: retry ? "pending" : unknown ? "outcomeUnknown" : "failed",
                  })
                : {}),
            failureCode: error instanceof WorkflowError ? error.code : "EXECUTION_FAILED",
            lease: undefined,
        },
        token,
        policy.leaseMs,
    );
}
