import type {
    CmsFunction,
    FunctionCall,
    FunctionForEach,
    FunctionStep,
} from "cms-functions/interfaces/FunctionDefinition";
import type { ExecuteFunctionOptions } from "cms-functions/core/execution/executeFunction";
import { FunctionExecutionError, RecoverableFunctionCallError } from "cms-functions/core/model/errors";
import { resolveFunctionValue, type FunctionRuntimeVars } from "cms-functions/core/model/expressions";
import {
    MAX_FUNCTION_LOOP_ITEMS,
    MAX_FUNCTION_RESPONSE_BYTES,
    utf8ByteLength,
} from "cms-functions/core/execution/context/limits";

export type FunctionCallBudget = { calls: number };
type ResultBudget = { bytes: number; maxBytes: number };
type StepRunner = (
    steps: FunctionStep[],
    vars: FunctionRuntimeVars,
    options: ExecuteFunctionOptions,
    definition: CmsFunction,
    budget: FunctionCallBudget,
) => Promise<Response | undefined>;

export async function executeForEach(
    id: string,
    loop: FunctionForEach,
    vars: FunctionRuntimeVars,
    options: ExecuteFunctionOptions,
    definition: CmsFunction,
    budget: FunctionCallBudget,
    runSteps: StepRunner,
): Promise<Response | undefined> {
    validateLoop(id, loop);
    const items = resolveFunctionValue(loop.items, vars);
    if (!Array.isArray(items)) {
        throw new FunctionExecutionError(`forEach "${id}" items must be an array`, 400);
    }
    if (items.length > loop.max) {
        throw new FunctionExecutionError(`forEach "${id}" exceeds max items`, 400);
    }
    const results: unknown[] = [];
    const resultBudget = createResultBudget(loop, options);
    assertResultBudget(id, resultBudget);
    const innerCallIds = loop.steps
        .filter((step): step is Extract<FunctionStep, { call: FunctionCall }> => "call" in step)
        .map((step) => step.id);

    for (const [index, item] of items.entries()) {
        const childVars: FunctionRuntimeVars = { ...vars, item, index, steps: { ...(vars.steps ?? {}) } };
        let needsRecovery = false;
        try {
            const failure = await runSteps(loop.steps, childVars, options, definition, budget);
            if (failure) {
                if (loop.continueOnError !== true) {
                    return failure;
                }
                needsRecovery = true;
            }
        } catch (error) {
            if (loop.continueOnError !== true || !(error instanceof RecoverableFunctionCallError)) {
                throw error;
            }
            needsRecovery = true;
        }
        if (needsRecovery) {
            const failure = await recoverItem(
                id,
                loop,
                childVars,
                options,
                definition,
                budget,
                results,
                resultBudget,
                runSteps,
            );
            if (failure) {
                return failure;
            }
            continue;
        }
        const value =
            loop.yield === undefined
                ? Object.fromEntries(innerCallIds.map((stepId) => [stepId, childVars.steps?.[stepId]]))
                : resolveFunctionValue(loop.yield, childVars);
        pushResult(id, results, value, resultBudget);
    }
    vars.steps ??= {};
    vars.steps[id] = results;
    return undefined;
}

async function recoverItem(
    id: string,
    loop: FunctionForEach,
    vars: FunctionRuntimeVars,
    options: ExecuteFunctionOptions,
    definition: CmsFunction,
    budget: FunctionCallBudget,
    results: unknown[],
    resultBudget: ResultBudget,
    runSteps: StepRunner,
): Promise<Response | undefined> {
    if (!loop.onError?.length) {
        throw new FunctionExecutionError("A continuing forEach error requires onError steps", 500);
    }
    const failure = await runSteps(loop.onError, vars, options, definition, budget);
    if (failure) {
        return failure;
    }
    const errorYield = loop.errorYield === undefined ? { failed: true } : loop.errorYield;
    pushResult(id, results, resolveFunctionValue(errorYield, vars), resultBudget);
    return undefined;
}

function validateLoop(id: string, loop: FunctionForEach): void {
    if (!Number.isInteger(loop.max) || loop.max < 1 || loop.max > MAX_FUNCTION_LOOP_ITEMS) {
        throw new FunctionExecutionError(
            `forEach "${id}" max must be an integer between 1 and ${MAX_FUNCTION_LOOP_ITEMS}`,
            400,
        );
    }
}

function createResultBudget(loop: FunctionForEach, options: ExecuteFunctionOptions): ResultBudget {
    return {
        bytes: loop.continueOnError === true ? 2 : 0,
        maxBytes:
            loop.continueOnError === true
                ? (options.maxResponseBytes ?? MAX_FUNCTION_RESPONSE_BYTES)
                : Number.POSITIVE_INFINITY,
    };
}

function pushResult(id: string, results: unknown[], value: unknown, budget: ResultBudget): void {
    if (!Number.isFinite(budget.maxBytes)) {
        results.push(value);
        return;
    }
    budget.bytes += utf8ByteLength(JSON.stringify(value) ?? "null") + (results.length ? 1 : 0);
    assertResultBudget(id, budget);
    results.push(value);
}

function assertResultBudget(id: string, budget: ResultBudget): void {
    if (budget.bytes > budget.maxBytes) {
        throw new FunctionExecutionError(`Function forEach "${id}" result is too large`, 500);
    }
}
