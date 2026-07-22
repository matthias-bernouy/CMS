import type { CmsFunction, FunctionAssert, FunctionStep } from "cms-functions/interfaces/FunctionDefinition";
import type { ExecuteFunctionOptions } from "cms-functions/core/execution/executeFunction";
import { executeFunctionCall } from "cms-functions/core/execution/calls/executeFunctionCall";
import { executeForEach, type FunctionCallBudget } from "cms-functions/core/execution/calls/forEachExecution";
import { MAX_FUNCTION_CALLS } from "cms-functions/core/execution/context/limits";
import { json } from "cms-functions/core/execution/output/response";
import { evaluateCondition } from "cms-functions/core/model/conditions";
import { FunctionExecutionError } from "cms-functions/core/model/errors";
import type { FunctionRuntimeVars } from "cms-functions/core/model/expressions";

export async function runFunctionSteps(
    steps: FunctionStep[],
    vars: FunctionRuntimeVars,
    options: ExecuteFunctionOptions,
    definition: CmsFunction,
    budget: FunctionCallBudget = { calls: 0 },
): Promise<Response | undefined> {
    vars.steps ??= {};
    for (const step of steps) {
        if ("assert" in step) {
            const failure = assertFailureResponse(step.assert, vars);
            if (failure?.status && failure.status >= 500) {
                throw new FunctionExecutionError("Function assertion failed", failure.status);
            }
            if (failure) {
                return failure;
            }
            continue;
        }
        if ("forEach" in step) {
            const failure = await executeForEach(
                step.id,
                step.forEach,
                vars,
                options,
                definition,
                budget,
                runFunctionSteps,
            );
            if (failure) {
                return failure;
            }
            continue;
        }
        if (budget.calls >= MAX_FUNCTION_CALLS) {
            throw new FunctionExecutionError("Function exceeded its call budget", 500, undefined, undefined, {
                stepId: step.id,
                source: step.call.source,
                endpoint: step.call.endpoint,
            });
        }
        budget.calls += 1;
        vars.steps[step.id] = await executeFunctionCall(step.call, vars, options, definition, step.id);
    }
    return undefined;
}

function assertFailureResponse(assertion: FunctionAssert, vars: FunctionRuntimeVars): Response | undefined {
    if (evaluateCondition(assertion.condition, vars)) {
        return undefined;
    }
    const failure = assertion.failure ?? {};
    return json({ error: failure.error ?? "Forbidden" }, failure.status ?? 403);
}
