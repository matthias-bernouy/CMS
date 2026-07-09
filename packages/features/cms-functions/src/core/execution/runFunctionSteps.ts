import type {
    FunctionAssert,
    FunctionCall,
    FunctionForEach,
    FunctionStep,
} from "../../interfaces/FunctionDefinition";
import { evaluateCondition } from "../conditions";
import type { ExecuteFunctionOptions } from "../executeFunction";
import { FunctionExecutionError } from "../errors";
import { resolveFunctionValue, type FunctionRuntimeVars } from "../expressions";
import { executeFunctionCall } from "./executeFunctionCall";
import { MAX_FUNCTION_CALLS } from "./limits";
import { json } from "./response";

type CallBudget = { calls: number };

export async function runFunctionSteps(
    steps: FunctionStep[],
    vars: FunctionRuntimeVars,
    options: ExecuteFunctionOptions,
    budget: CallBudget = { calls: 0 },
): Promise<Response | undefined> {
    vars.steps ??= {};
    for (const step of steps) {
        if ("assert" in step) {
            const failure = assertFailureResponse(step.assert, vars);
            if (failure) return failure;
            continue;
        }
        if ("forEach" in step) {
            const failure = await executeForEach(step.id, step.forEach, vars, options, budget);
            if (failure) return failure;
            continue;
        }
        if (budget.calls >= MAX_FUNCTION_CALLS) {
            throw new FunctionExecutionError("Function exceeded its call budget", 500);
        }
        budget.calls += 1;
        vars.steps[step.id] = await executeFunctionCall(step.call, vars, options);
    }
    return undefined;
}

async function executeForEach(
    id: string,
    loop: FunctionForEach,
    vars: FunctionRuntimeVars,
    options: ExecuteFunctionOptions,
    budget: CallBudget,
): Promise<Response | undefined> {
    const items = resolveFunctionValue(loop.items, vars);
    if (!Array.isArray(items)) throw new FunctionExecutionError(`forEach "${id}" items must be an array`, 400);
    if (items.length > loop.max) throw new FunctionExecutionError(`forEach "${id}" exceeds max items`, 400);

    const results: unknown[] = [];
    const innerCallIds = loop.steps
        .filter((step): step is Extract<FunctionStep, { call: FunctionCall }> => "call" in step)
        .map(step => step.id);

    for (const [index, item] of items.entries()) {
        const childVars: FunctionRuntimeVars = {
            ...vars,
            item,
            index,
            steps: { ...(vars.steps ?? {}) },
        };
        const failure = await runFunctionSteps(loop.steps, childVars, options, budget);
        if (failure) return failure;
        results.push(loop.yield === undefined
            ? Object.fromEntries(innerCallIds.map(stepId => [stepId, childVars.steps?.[stepId]]))
            : resolveFunctionValue(loop.yield, childVars));
    }

    vars.steps ??= {};
    vars.steps[id] = results;
    return undefined;
}

function assertFailureResponse(assertion: FunctionAssert, vars: FunctionRuntimeVars): Response | undefined {
    if (evaluateCondition(assertion.condition, vars)) return undefined;
    const failure = assertion.failure ?? {};
    return json({ error: failure.error ?? "Forbidden" }, failure.status ?? 403);
}
