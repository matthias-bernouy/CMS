import type {
    FunctionAssert,
    FunctionCall,
    FunctionForEach,
    FunctionStep,
} from "../../interfaces/FunctionDefinition";
import { MAX_FUNCTION_LOOP_ITEMS } from "../execution/limits";
import { isId } from "./ids";
import { validateCall } from "./validateCall";
import { validateReferences } from "./validateReferences";
import { endpointOutputShape } from "./shapes";
import type { ValidationState } from "./state";

export async function validateSteps(
    steps: FunctionStep[],
    basePath: string,
    state: ValidationState,
    inLoop: boolean,
): Promise<number> {
    let callCount = 0;
    for (const [index, step] of steps.entries()) {
        const path = `${basePath}.${index}`;
        if ("call" in step) {
            callCount += await validateCallStep(step, path, state, inLoop);
            continue;
        }
        if ("forEach" in step) {
            callCount += await validateForEachStep(step.id, step.forEach, path, state, inLoop);
            continue;
        }
        if ("assert" in step) {
            validateAssertStep(step, path, state, inLoop);
            continue;
        }
        state.errors.push(`${path} must declare call, forEach, or assert`);
    }
    return callCount;
}

async function validateCallStep(
    step: Extract<FunctionStep, { call: FunctionCall }>,
    path: string,
    state: ValidationState,
    inLoop: boolean,
): Promise<number> {
    validateStepId(step.id, path, state);
    validateReferences(step.call, `${path}.call`, state, inLoop);
    const endpoint = await validateCall(state.fn, step.call, `${path}.call`, state.options.sources ?? null, state.errors);
    if (isId(step.id)) {
        state.stepShapes.set(step.id, endpoint ? endpointOutputShape(endpoint) : null);
        state.knownStepIds.add(step.id);
    }
    return 1;
}

async function validateForEachStep(
    id: string,
    loop: FunctionForEach,
    path: string,
    state: ValidationState,
    inLoop: boolean,
): Promise<number> {
    validateStepId(id, path, state);
    if (inLoop) state.errors.push(`${path}.forEach must not be nested`);
    validateReferences(loop.items, `${path}.forEach.items`, state, inLoop);
    if (!Number.isInteger(loop.max) || loop.max < 1 || loop.max > MAX_FUNCTION_LOOP_ITEMS) {
        state.errors.push(`${path}.forEach.max must be an integer between 1 and ${MAX_FUNCTION_LOOP_ITEMS}`);
    }
    if (!Array.isArray(loop.steps) || !loop.steps.length) {
        state.errors.push(`${path}.forEach.steps must be a non-empty array`);
    }
    validateRecoveryPolicy(loop, path, state.errors);

    const childState: ValidationState = {
        ...state,
        knownStepIds: new Set(state.knownStepIds),
        stepShapes: new Map(state.stepShapes),
    };
    const childCallCount = !inLoop && Array.isArray(loop.steps) && loop.steps.length
        ? await validateSteps(loop.steps, `${path}.forEach.steps`, childState, true)
        : 0;
    if (!inLoop && loop.yield !== undefined) validateReferences(loop.yield, `${path}.forEach.yield`, childState, true);

    const errorState: ValidationState = {
        ...state,
        knownStepIds: new Set(state.knownStepIds),
        stepShapes: new Map(state.stepShapes),
    };
    const errorCallCount = !inLoop && Array.isArray(loop.onError) && loop.onError.length
        ? await validateSteps(loop.onError, `${path}.forEach.onError`, errorState, true)
        : 0;
    if (!inLoop && loop.errorYield !== undefined) {
        validateReferences(loop.errorYield, `${path}.forEach.errorYield`, errorState, true);
    }
    if (isId(id)) {
        state.stepShapes.set(id, null);
        state.knownStepIds.add(id);
    }
    const callsPerItem = childCallCount + (loop.continueOnError === true ? errorCallCount : 0);
    return callsPerItem * (Number.isInteger(loop.max) ? loop.max : 0);
}

function validateRecoveryPolicy(loop: FunctionForEach, path: string, errors: string[]): void {
    if (loop.continueOnError !== undefined && typeof loop.continueOnError !== "boolean") {
        errors.push(`${path}.forEach.continueOnError must be a boolean`);
    }
    if (loop.continueOnError === true && (!Array.isArray(loop.onError) || !loop.onError.length)) {
        errors.push(`${path}.forEach.onError must be a non-empty array when continueOnError is true`);
    }
    if (loop.continueOnError !== true && loop.onError !== undefined) {
        errors.push(`${path}.forEach.onError requires continueOnError to be true`);
    }
    if (loop.continueOnError !== true && loop.errorYield !== undefined) {
        errors.push(`${path}.forEach.errorYield requires continueOnError to be true`);
    }
}

function validateAssertStep(
    step: Extract<FunctionStep, { assert: FunctionAssert }>,
    path: string,
    state: ValidationState,
    inLoop: boolean,
): void {
    validateReferences(step.assert.condition, `${path}.assert.condition`, state, inLoop);
    if (step.assert.failure?.status !== undefined && !validFailureStatus(step.assert.failure.status)) {
        state.errors.push(`${path}.assert.failure.status must be an HTTP error status`);
    }
}

function validateStepId(id: string, path: string, state: ValidationState): void {
    if (!isId(id)) {
        state.errors.push(`${path}.id must be a simple id`);
        return;
    }
    if (state.stepIds.has(id)) state.errors.push(`duplicate step id "${id}"`);
    state.stepIds.add(id);
}

function validFailureStatus(status: number): boolean {
    return Number.isInteger(status) && status >= 400 && status <= 599;
}
