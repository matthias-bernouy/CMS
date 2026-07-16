import type {
    FunctionAssert,
    FunctionCall,
    FunctionForEach,
    FunctionStep,
    CmsFunction,
} from "../../interfaces/FunctionDefinition";
import { evaluateCondition } from "../conditions";
import type { ExecuteFunctionOptions } from "../executeFunction";
import { FunctionExecutionError } from "../errors";
import { resolveFunctionValue, type FunctionRuntimeVars } from "../expressions";
import { executeFunctionCall, RecoverableFunctionCallError } from "./executeFunctionCall";
import { MAX_FUNCTION_CALLS, MAX_FUNCTION_LOOP_ITEMS, MAX_FUNCTION_RESPONSE_BYTES, utf8ByteLength } from "./limits";
import { json } from "./response";

type CallBudget = { calls: number };
type ResultBudget = { bytes: number; maxBytes: number };

export async function runFunctionSteps(
    steps: FunctionStep[],
    vars: FunctionRuntimeVars,
    options: ExecuteFunctionOptions,
    definition: CmsFunction,
    budget: CallBudget = { calls: 0 },
): Promise<Response | undefined> {
    vars.steps ??= {};
    for (const step of steps) {
        if ("assert" in step) {
            const failure = assertFailureResponse(step.assert, vars);
            if (failure?.status && failure.status >= 500) {
                throw new FunctionExecutionError("Function assertion failed", failure.status);
            }
            if (failure) return failure;
            continue;
        }
        if ("forEach" in step) {
            const failure = await executeForEach(step.id, step.forEach, vars, options, definition, budget);
            if (failure) return failure;
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

async function executeForEach(
    id: string,
    loop: FunctionForEach,
    vars: FunctionRuntimeVars,
    options: ExecuteFunctionOptions,
    definition: CmsFunction,
    budget: CallBudget,
): Promise<Response | undefined> {
    if (!Number.isInteger(loop.max) || loop.max < 1 || loop.max > MAX_FUNCTION_LOOP_ITEMS) {
        throw new FunctionExecutionError(
            `forEach "${id}" max must be an integer between 1 and ${MAX_FUNCTION_LOOP_ITEMS}`,
            400,
        );
    }
    const items = resolveFunctionValue(loop.items, vars);
    if (!Array.isArray(items)) throw new FunctionExecutionError(`forEach "${id}" items must be an array`, 400);
    if (items.length > loop.max) throw new FunctionExecutionError(`forEach "${id}" exceeds max items`, 400);

    const results: unknown[] = [];
    const resultBudget: ResultBudget = {
        bytes: loop.continueOnError === true ? 2 : 0,
        maxBytes: loop.continueOnError === true
            ? options.maxResponseBytes ?? MAX_FUNCTION_RESPONSE_BYTES
            : Number.POSITIVE_INFINITY,
    };
    assertResultBudget(id, resultBudget);
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
        let needsRecovery = false;
        try {
            const failure = await runFunctionSteps(loop.steps, childVars, options, definition, budget);
            if (failure) {
                if (loop.continueOnError !== true) return failure;
                needsRecovery = true;
            }
        } catch (error) {
            if (loop.continueOnError !== true || !isRecoverableForEachError(error)) throw error;
            needsRecovery = true;
        }
        if (needsRecovery) {
            const failure = await recoverForEachItem(
                id,
                loop,
                childVars,
                options,
                definition,
                budget,
                results,
                resultBudget,
            );
            if (failure) return failure;
            continue;
        }
        pushForEachResult(id, results, loop.yield === undefined
            ? Object.fromEntries(innerCallIds.map(stepId => [stepId, childVars.steps?.[stepId]]))
            : resolveFunctionValue(loop.yield, childVars), resultBudget);
    }

    vars.steps ??= {};
    vars.steps[id] = results;
    return undefined;
}

async function recoverForEachItem(
    id: string,
    loop: FunctionForEach,
    vars: FunctionRuntimeVars,
    options: ExecuteFunctionOptions,
    definition: CmsFunction,
    budget: CallBudget,
    results: unknown[],
    resultBudget: ResultBudget,
): Promise<Response | undefined> {
    if (!loop.onError?.length) {
        throw new FunctionExecutionError("A continuing forEach error requires onError steps", 500);
    }
    const failure = await runFunctionSteps(loop.onError, vars, options, definition, budget);
    if (failure) return failure;
    const errorYield = loop.errorYield === undefined ? { failed: true } : loop.errorYield;
    pushForEachResult(id, results, resolveFunctionValue(errorYield, vars), resultBudget);
    return undefined;
}

function isRecoverableForEachError(error: unknown): error is RecoverableFunctionCallError {
    return error instanceof RecoverableFunctionCallError;
}

function pushForEachResult(id: string, results: unknown[], value: unknown, budget: ResultBudget): void {
    if (!Number.isFinite(budget.maxBytes)) {
        results.push(value);
        return;
    }
    const serialized = JSON.stringify(value) ?? "null";
    budget.bytes += utf8ByteLength(serialized) + (results.length ? 1 : 0);
    assertResultBudget(id, budget);
    results.push(value);
}

function assertResultBudget(id: string, budget: ResultBudget): void {
    if (budget.bytes > budget.maxBytes) {
        throw new FunctionExecutionError(`Function forEach "${id}" result is too large`, 500);
    }
}

function assertFailureResponse(assertion: FunctionAssert, vars: FunctionRuntimeVars): Response | undefined {
    if (evaluateCondition(assertion.condition, vars)) return undefined;
    const failure = assertion.failure ?? {};
    return json({ error: failure.error ?? "Forbidden" }, failure.status ?? 403);
}
